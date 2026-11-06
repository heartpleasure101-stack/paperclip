# Design

## Context

本 agent 唯讀研究目前 `e5eee012e` 工作樹及既有實際 log，未參考舊實作分支：

- Cursor `writeFakeSandboxCursorAgent` 以 `#!/usr/bin/env node` 啟動；正式 `defaultPathForPlatform` 不含 nvm。這是替身 runtime 配置依賴，不應改正式 PATH。
- Muse Python fixture 在 `HTTPError(..., fp=None)` 後呼叫 `close()`，Python 3.9.6 在 tempfile 產生 KeyError；相同合約用 Python 3.12 通過。v1–v9 Muse assets 有固定 byte pins，不應為測試修改。
- `github-connection-enrollment-work.test.ts` 在原版與修改版皆 ack=0。案例同時使用凍結 Date／setTimeout、真實 PostgreSQL、真實 loopback HTTP；`observe` 固定 Date、只 yield I/O。相鄰 work suite 的時鐘策略不同，但這僅是診斷線索，尚非根因證據。
- 官方 runner 已支援 dry-run 選集、duration-aware 分片、獨立 native-runner 組；無分片的 general-server 會將昂貴真實 lease 測試串行執行。既有 native-runner 組以四個隔離 fork 重疊等待，無須發明新測試 runner。
- tasks 1–3 的獨立審查確認一次未提交的診斷 probe 違反禁網路安裝限制：Cursor installer 確實在暫存 fake HOME 安裝並執行 binary，且留下真實 TMPDIR log。未發現仍在執行的程序或真實 HOME 的 Cursor 安裝；但繼承環境與網路傳輸無完整事前紀錄，不能保證沒有憑證暴露。保留事故證據、不讀取 secret 值、不自行輪替憑證或繞過被拒絕的刪除；先修補 guard 與紀錄，再進整合。

## Goals / Non-Goals

**Goals:** 修正測試本身可攜性與已知 enrollment 失敗，提供可重現的隔離條件，對真實版本完成全覆蓋驗證，解除摘要 change 的驗收阻礙。

**Non-Goals:** 不改全域 Node／Git／Python／Rust、不改正式 sandbox PATH、不部署、不改 Muse 已發布資產、不引入套件、不關閉安全機制；不做摘要第二階段。

## Decisions

1. **修正替身，而非放寬正式執行環境。** 優先在 fake HOME 的 `.local/bin` 為替身提供實際測試 Node（由 `process.execPath` 識別）；使用真實 CLI 執行與既有捕捉斷言，不透過外部 spawn monkeypatch。避免絕對 shebang 在含空白路徑失效；fixture 建立與清理皆限自身暫存目錄。缺失命令仍必須被測出，不接觸網路安裝 Cursor。此限制也適用所有臨時診斷與 mutation；不得為取得 stderr 移除安裝 guard。guard 必須在執行前檢查 command、args 與可執行 stdin，拒絕 installer URL、curl/wget 與未知安裝形式，不能只依賴複製的單一字面字串。guard 回歸／mutation 僅可使用無網路的本機 sentinel，禁止讓真實下載器成為反例。複審發現路徑形狀仍會通過、另兩個 Cursor package 測試 runner 未受保護，因此 guard 必須依每個測試明確登記的 executable 與可信 shell 形狀放行，不接受整個 os.tmpdir() 作為可信根，也不因 token 看起來像路徑就放行。所有 shell 命令位置與可執行 stdin 都要驗證，未知形式立即失敗。已知安裝請求只可被明確的無網路 stub 消化，不能 fallback 到真實執行。套用到 server 與 cursor-local 的全部假 runner；若共用 helper，置於窄的 provider-neutral test-fixtures 介面，Cursor 形狀與 policy 由消費端提供，不新增正式 runtime API 或依賴。
2. **修正模擬回應的生命週期。** 使用可關閉的合成回應串流來建構 HTTPError，覆蓋 Python 3.9 與可用較新版本。與強迫升級主機 Python 相比，這保留既有 runtime 相容性；只改 fixture，不改 client.py 或 pins。
3. **enrollment 先因果診斷、後最小修復。** 執行 agent 在隔離快照內重現並暫時蒐集 poll 結果、errors、HTTP 路由、receipt 狀態、排程／時鐘與身分階段，形成可核對診斷。若只是虛擬時鐘阻塞真實 I/O，修正測試的有界協調與診斷；若相同契約在真實時鐘／受控依賴下也失敗，才修正 event/enrollment 的最小擁有者並加失敗前後證據。禁止只加等待、刪斷言、關閉驗證、改全域 scheduler 或新增輪詢。這是事先定義的修復選擇規則，不預設未知根因。
4. **輕量 preflight，不新建框架。** 使用既有 Node 和標準庫增加小型唯讀檢查入口及文件，記錄工具位置／版本、Node engine、Git 必要 `rev-list --stdin --not` 能力與當次階段需要的 Rust／Python。Git 能力在自有暫存 repo 探測後清理；缺項非零退出，無下載／全域安裝。工具可由 session PATH 或明確路徑供應，不以「只有本機絕對路徑可用」作為交付。子程序的 Corepack probe 禁止網路取得工具、Git 設定 optional locks 關閉；暫存目錄無法建立等失敗仍須提供可機讀的非零結果，不以 uncaught stack 代替診斷。
   Phase 06 實測新增缺口：`vitest-chat-shards.test.ts` 的微型專案僅寫入 `{ private: true }`，Corepack 禁網時未宣告版本的 pnpm 解析失敗（驗證紀錄 §15）。先在自有、複製的快取做有界對照，區分缺省版本解析與既有版本不可用；優先以 Corepack 公開介面明確啟用隔離快取內已存在的專案版本，禁止網路與主機 prefix／預設變更。若環境配置不能解決，才在 fixture 宣告 repo 的 packageManager，不能修改正式 runner 或增加等待。將此自測納入重啟完整流程前的 blocker。保留失敗 log 與原 manifest，重試另存 attempt；只有源碼快照／工具版本相同且能證明先前組的版本解析與 skips 不受快取修正影響，才延續其通過證據；若修改 source 或無法證明不受影響，重跑相應驗證，不把舊結果冒充新快照。
5. **先通過所有 blocker，再跑昂貴完整驗收。** Cursor、Muse、enrollment 與相關回歸及 preflight 都通過後，封存程式碼身分並跑全量 typecheck/build。完整驗證子行程使用明確環境 allowlist 與自有暫存 HOME／PAPERCLIP_HOME（例如 env -i 的可重現命令），只傳工具路徑、必要 cache 與測試設定，不傳 provider/API 憑證或個人設定；父 Pi/agy 的模型認證不變。以假 sentinel 證明變數未繼承，不讀取真實秘密。已存在的 pnpm/cache 可明確配置，但禁止 Corepack 自動下載、禁止沿用外部 NODE_OPTIONS monkeypatch。這是程序環境隔離，不是假稱 OS sandbox。

   完整 tests 使用官方 dry-run inventory 與既有模式：chat；general-server-without-chat-or-native-runner；general-server-native-runner；workspaces-a/b/c；serialized。依記憶體選擇保守並行／分片，不改 runner 的選集或 skip 規則。記錄所有 shard 指標與退出碼，證明聯集等同完整入口；不得以 driver 最後 echo 的 exit 0 代替每組結果。此 CI 等價全覆蓋可作為兩個 change 的完整驗收，不要求重新把已驗證的同一不可變快照用最慢單一入口再跑一次。
   Phase 07 另在 `file-resources-git-scan-load.test.ts` 發現 singleFlightJoins 384／預期 498，原門檻 15 秒，其他 9943 案例通過。唯讀觀測主機 `kern.ipc.somaxconn=128`、shell soft FD limit=1048575；此為診斷線索，不預判根因。先短程比較原檔單獨／並行執行的請求與 socket／排程指標，不動源碼或 sysctl。若證明僅為與其他檔案共用資源的干擾，可將原組精確拆成負載檔串行子組與其餘檔案子組，使用既有官方 Vitest 設定及參數，保留500請求、498 joins、兩個底層 scan、500個200回應、25次health及p99<250ms、15秒／60秒時限。子組必須無重疊且聯集完全等於原組，逐一記錄零退出與 immutable cc56 source；獨立複核配置與等價性後才續跑。不得添加虛假 shared-DB／skip 旗標來改 worker 數，不改正式 runner 或產品；如無源碼不變的可靠解法，先回報新提案，不能私自修改測試。
   2.10 的三次單檔實測亦失敗（403／412／399 joins），因此不採用僅隔離執行的方案；探針中的 maxSockets=100 只驗證傳輸機制，不能用於正式測試，否則 Gate 關閉時僅100請求可在途，違反500負載。下一項2.11只授權修改該測試檔的TCP連線準備：以有界小批次等待真實connection接受事件，再發下一批，但絕不等待HTTP回應、提前釋放scanGate或降低同時在途數。所有500請求抵達後仍全部未完成，再測25次health、p99<250ms、498joins／2scans及500個200。從第一個負載請求開始共用原15秒admission deadline（批次準備亦計入），保留60秒總限；新增明確500在途／零完成檢查及提前失敗的清理負向證據。只能改這一個test fixture、無新依賴／global helper／產品／runner變更；先另立版本化修復工作樹，不改舊cc56凍結樣本。

   僅此待驗證test檔改變時，產出每組實際執行commit與最終目標的source-equivalence清冊：所有產品、共享helper、config、lockfile／工具及該組selected tests須逐byte相同，並檢查會掃描／讀取其他test檔的反向依賴；未知或受影響者必須重跑。原組與新子組須精確覆蓋完整選集，不能把單檔通過等同整批。該負載檔及受影響整組在新固定snapshot跑完；不得把cc56舊結果改寫為新HEAD已實跑。獨立審查可拒絕任一延續證據，屆時重跑相應組。此規則不容許跨產品／共享code或不同工具版本冒用舊結果。
   Phase10之adapter-utils環境案例失敗：預期GIT_CONFIG_GLOBAL不存在，但clean-env合法提供自有synthetic config。2.12只授權修改github-launcher-environment.test.ts：原本機host案例在fake HOME已建立後明確stub掉GIT_CONFIG_GLOBAL，保留原undefined／credential.helper=store／token／worktree／隔離模式斷言；再以另一自有含空格路徑config及與HOME不同的假helper證明顯式override確實保留且Git優先讀取，afterEach還原全部env。不得削弱共用clean-env、清空真實父agent環境、讀取真實Git／gh／Keychain／credential store或改execution-target程式。來源變更僅此測試檔，沿用前述逐組source/read-dependency等價條件：1–6實測cc56、7–9實測3f1eb1b7b，保留各自身份；新快照完整重跑Phase10全部17projects（非只adapter-utils），11–15仍未執行。原Phase10失敗及當批未執行projects不得改成通過。
   2.13先由全新稽核者核對實際兩次attempt2行為：21:54缺package links失敗後，代理違規自行APFS補37個ignored依賴目錄並沿用attempt2重跑，22:00於Hermes三案遇到python3.9<3.10而失敗；§20不能以後者取代前者。保留既存所有log／manifest，從該AGY session原始task log找回第一個失敗原文，來源、時間、exit與缺失必須明列；若不可復原即明說，不製造raw。先獨立復原／審查，不允許稽核者自行全批重跑。private ops可修正唯一attempt分配與log exclusive-create，無害fake-child證明遇失敗不執行後組及既存檔案完全不動；不改正式runner／共同clean-env或任何測試／產品程式。

   依賴完整性須逐workspace實際檢查node_modules與公開subpath指向目前snapshot／相同pinned cache的可讀輸出，不以15個runtime asset存在推論所有套件已完整。Python只在Phase10使用自有tool-bin的python3入口指向既有3.15，保留其他bin順序與版本；其他舊組仍按原3.9矩陣。先以Hermes全package及低於3.10負向條件檢查版本需求與實際模型探針，禁止降版本門檻、安裝Python或全面換brew優先順序。未知相依影響使先前結果失效；獨立GO後新的獨立attempt才可重跑全17project Phase10與11–15。失敗歷史、環境變更與不合規重跑分開記錄，無安全all-clear。
6. **版本與交付分離。** 執行 agent 從 master 建立獨立 baseline 修復分支及 fork PR（與原摘要 PR 分開）。可用本機工作樹保存 parent 已撰寫的本 change 與必要相同 OpenSpec 初始化設定。完成窄範圍修復後，以一般 merge commit 整合到摘要分支，留下來源 commit 與兩個 PR 的關聯；不 force-push、不透過 GitHub merge。只對該整合 HEAD 跑一次完整驗收，程式碼不變時可在純文件／封存 commit 後以 tree 比對延續證據。不能把整合 HEAD 結果標成獨立 master 沒有差異。
7. **獨立驗證及封存門檻。** 依使用者 2026-11-05 模型變更，後續實作與審查由 agy Gemini 3.8 Flash High 執行；保留已完成與未提交的 Sonnet 工作，不將配額中止誤報為空 session。全新且獨立於實作者的 agy session 檢查根因、spec scenario 映射、原斷言、preflight、所有組的覆蓋與退出碼。驗收通過後更新本 change 及原摘要 tasks／驗證紀錄，依 CLI archive 同步 specs，修正封存後文件連結並 push。任何必要組失敗／未跑，不封存、不移除 draft。原摘要嚴格相等與 Pi-only 規格不變。

## Risks / Trade-offs

- [把環境缺陷當產品缺陷] → 測試 fixture 與正式 owner 分離，GitHub 生產修改需真實依賴的因果證據。
- [並行耗盡記憶體或共享資料庫] → 使用 runner 既有隔離機制與有界 worker；若共享外部 test DB，依官方限制退回串行；不指向正式 DB。
- [分組漏測或過時快照] → 用官方 dry-run 對照每組與完整選集，所有組記錄 SHA／tree 與退出結果，修改程式碼後重跑受影響證據並評估全量有效性。
- [斷言被悄悄弱化] → 記錄 before/after、mutation 或受控故障證據；獨立審查比較原斷言與正式 source diff。
- [只在本機 temp hack 有效] → 交付 repo 內 fixture/preflight 改動與可執行文件；全量不用外部 monkeypatch、未版本化修正或全域 symlink。

## Migration Plan

無正式環境遷移。preflight 僅讀取環境並建立自有暫存探測資料；必要工具仍由使用者既有或隔離路徑提供。回滾使用對應 repair commits 的 revert，保留原始失敗及檢查證據；不刪資料、不停現有服務。兩個 PR 都只交付可審查成果，不自動 merge 或部署。
