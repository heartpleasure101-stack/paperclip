# Tasks

## 1. 獨立修復分支與證據基線

- [x] 1.1 從 master 建立獨立修復 branch／本機工作樹，攜帶本 agent 已撰寫的 change 與必要 OpenSpec 設定；提交規格、push 並於使用者 fork 建立 base=master 的 draft PR，依 repo PR template 填寫，記錄 URL 與 base SHA。
- [x] 1.2 讀取實作範圍 instructions，於本機隔離目錄重現 Cursor、Muse、enrollment 已知失敗並記錄工具、退出碼、版本／tree、原斷言及使用的測試選集；不啟動全量流程。

## 2. 自含測試替身與前置檢查

- [x] 2.1 修正 Cursor fake sandbox runtime 配置；以刻意排除主機 Node 路徑的環境驗證原 5 案例及缺失命令可偵測，保留 command、PATH 與提示斷言；確認正式 adapter/server-utils PATH 無變更，無網路安裝。
- [x] 2.2 修正 Muse fixture 的模擬 HTTPError 可關閉資源；用 Python 3.9 與可用較新版本執行合約案例，檢查已發布 assets／pins 位元組未變，所有原斷言仍成立。
- [x] 2.3 增加輕量唯讀 preflight 與其測試，覆蓋條件通過、缺項非零退出、隔離工具路徑及自有暫存清理；記錄 Node／Git 能力／Python／當次需要的 Rust，不自動安裝工具或接觸正式資料。
- [x] 2.4 更新開發文件中隔離驗證、工具覆寫、先跑 blocker 的命令及失敗處理；在乾淨暫存 HOME 執行文件命令證明不需未版本化 monkeypatch 或全域 symlink。

- [x] 2.5 修正獨立審查 W1/W2：補正事故紀錄（真實下載／執行、TMPDIR log、繼承環境及無法證明事項），強化安裝 guard 涵蓋 command／args／可執行 stdin 與變形安裝命令；以無網路 sentinel 證明執行前攔截，禁止重演真實安裝或繞過刪除限制，經獨立複審確認。
- [x] 2.6 補齊 preflight 唯讀邊界：Git optional locks、Corepack 禁網路、暫存建立失敗的機讀輸出；相關 fault tests 通過，確認無全域寫入或安裝，記錄實際驗證的 Node 版本限制。

- [x] 2.7 定義並實測可重現的 secret-free 驗證子行程環境：明確 allowlist、自有 HOME／Paperclip 設定、必要工具／cache；以假憑證 sentinel 證明不繼承主機變數，不改父 agent 認證或全域設定，不讀取真實秘密；乾淨環境的 preflight 與 blocker suites 全部通過，文件清楚說明並非 OS sandbox。

- [x] 2.8 修正第二輪複審的兩項 WARNING：每測試明確登記 executable／shell 形狀與自有 root，拒絕未知路徑命令、shell script、pipeline 或相對下載器；將同等保護套用 server 與 cursor-local 的全部假 sandbox runner，已知安裝只走無網路 stub；以無害字串／記錄 backend 重現四種繞過後證明拒絕，保留真實 fixture 執行及原斷言，再獨立複審。文件明確記錄 fake runner 依賴 clean-env、非 OS sandbox、SSH／Keychain 非隔離範圍及 signal 中止的清理限制，不擅自清理被拒的事故資料。

- [x] 2.9 診斷 Phase 06 的離線 pnpm 解析：在自有複製快取對照未宣告／已宣告 packageManager 的暫存專案、記錄 Corepack 版本解析與禁網結果；優先只啟用已存在的隔離快取版本，不動主機 prefix／預設、不下載或放行網路。保留原 7 個 fixture case 恰好一次及故意失敗傳遞斷言，不增加 timeout、不改正式 runner；將自測與缺快取負向檢查放入昂貴流程前的文件步驟，獨立驗證後才恢復。重試另存失敗 attempt／manifest；確認同一 source／工具版本下既有通過組與 skips 不受影響，否則重跑受影響組。

- [x] 2.10 有界診斷 Phase 07 負載檔之請求進入／socket／排程狀態，對照單檔與並行資源；保持500請求、498 joins、兩個scan、500個200、25次health與p99<250ms及原15秒／60秒時限，不改產品／測試／runner或主機全域限制。若證明需資源隔離，以官方既有Vitest設定與串行參數組成原組的完整等價子組，核對無漏／重複、保存先前失敗與每個子組退出碼，獨立複審後才恢復；無源碼不變解法則先回報，不反覆重試到綠。

- [x] 2.11 在版本化修復工作樹只調整 file-resources-git-scan-load.test.ts 的TCP接受準備：小批次有界等待connection、不等待回應，維持500全部在途／零完成後才觀測、498joins／2scans／500個200、25health及p99<250ms；原15秒從第一負載請求起計含準備、60秒總限不變，保留故障時關閉連線／釋放Gate及立即觀察拒絕。不得採用maxSockets100降低實際負載、改產品／shared／runner或全域設定。驗證修正前後與負向清理，獨立複審後整合；逐組source/read-dependency等價清冊明確列真正測試commit，未知依賴／共享變更重跑受影響組，該檔及受影響全組必須新快照重跑，不冒稱舊結果已在新HEAD實跑。

- [x] 2.12 有界重現Phase10之GIT_CONFIG_GLOBAL前提衝突，只修正github-launcher-environment.test.ts的自有host fixture：fake HOME內明確模擬無override，保留原undefined／helper=store／token／metadata／隔離斷言；新增自有含空格global config優先於HOME假helper的明確override案例，所有stub由afterEach還原，不接觸真實config／憑證／Keychain。禁止改共用clean-env／execution-target／runner／產品或全域設定；對照修正前後、三次全檔與相關安全回歸、typecheck、負向控制及獨立複審後整合。逐組真正測試commit與byte/read-dependency等價證據不改寫；未知依賴重跑，全17project Phase10必須在新不可變快照重跑，不以單檔／單project取代，保留失敗與11–15未執行狀態。

- [x] 2.13 獨立稽核Phase10曾在module-resolution失敗後自行補cache並沿用attempt2重跑的違規：從既存AGY原始task log／備份復原可證據，分開標明Git fixture、缺workspace links、Python過舊的實際失敗，未知欄位明列未知，禁止假造原始raw或悄悄重編覆寫。補齊自有ignored依賴及所有workspace/subpath解析清冊；private ops controller以exclusive-create、原子單次授權及明確phase／source／工具矩陣綁定、單次失敗停止與遞增attempt機制通過真實控制器的無害負向控制（含並行搶授權、空／未知phase拒絕且不消耗授權），不改官方runner／產品／測試或共用clean-env。僅為Phase10明確選用既有Python>=3.10（已存在3.15），自有bin只提供python3，不換全域PATH順序／安裝工具；驗證Hermes全package、老runtime缺項負向及其他工具hash不變。1–9保持真正測試版本與原runtime矩陣，新source/read-dependency等價證據及獨立GO後才恢復全17project Phase10與未執行11–15；2.12與本項直到所需全組exit0才完成。

- [x] 2.14 有界唯讀診斷Phase12 maintenance-server-routes前置build的COPILOT_INSTALLATION_INVALID：核對目前與舊快照之provider-assets、closure manifest／pins、package owner及symlink／缺檔差異，不下載或執行真實Copilot／Cursor、不改pins／verifier／測試／正式source。若可由已存在且驗證完整的pinned cache解決，先記錄來源／逐檔hash、保留失敗資產，提出自有ignored產物的離線準備方案，獨立GO後才實施與前置build；需要下載、真實CLI或變更產品時先停並要求新決策。完整保留Phase12 attempt1及後續NOT_RUN，按R3單次授權與新attempt恢復全原組，不弱化驗證或以跳過maintenance suite取得通過。

- [x] 2.15 修正最終獨立審查的必需native覆蓋缺口：在同一56d凍結source以既有Rust1.97離線編譯fake-codex-app-server debug fixture，確認realProcessIt所需runner與fixture兩個實體皆存在、cache與binary來源可核對，不改任何test／skip條件／產品。保留Phase08舊163pass／23skip歷史，新單次R3授權在56d重跑完整9suites，確實執行先前缺fixture跳過的9項；僅容器14項等已證明不適用條件可另列，不將缺fixture稱為合法跳過。修正author報告的3f1 commit／tree、chat檔名及指紋／skip範圍，peer報告保持原bytes並附勘誤；完整結果交新獨立複審，不以15個exit0標籤冒充必要能力全覆蓋。

## 3. GitHub enrollment 因果修復

- [x] 3.1 在隔離快照取得 ack=0 的因果證據（工作者 poll 結果／errors、HTTP 階段、delivery 狀態、虛擬時鐘／真實 I/O）；有界證明是哪一階段未完成，記錄 real-timer 或受控延遲對照，禁止只延長等待。
- [x] 3.2 依設計決策修復正確擁有者：test-only 時鐘協調／fixture，或經真實依賴證明有缺陷的最小 event/enrollment 服務；以失敗前後與受控故障證明修正生效，保留所有簽名、DB、身分替換、ack 及 25 分鐘安靜期斷言。
- [x] 3.3 執行 enrollment 原案例多次及相關 connection-work／connector 安全回歸，附明確命令與輸出；將根因、採取／未採取方案、原斷言保留與限制記入有日期的 doc/plans 驗證文件。

## 4. 整合與完整覆蓋驗證

- [x] 4.1 將修復分支以一般 merge commit 整合進原摘要 branch，記錄兩個 PR、merge SHA 與修復／Pi source tree；只做本機 merge 與普通 push，不 merge GitHub PR、不 force-push。
- [x] 4.2 在不可變整合快照上通過 preflight、全部已知 blocker 及摘要去重相關回歸，再執行 typecheck/build；每項附退出碼，未通過則不跑昂貴全量。
- [x] 4.3 用官方 dry-run 取得完整入口及分組／分片 inventory，證明 chat、general excluding chat/native、native-runner、workspaces-a/b/c、serialized 無遺漏；依本機資源限制並行並保存實際選集。
- [x] 4.4 執行全部官方等價測試組，每組／shard 皆保留命令、退出碼、tests／skips、版本及 log；確認每個必要組 exit=0、無測試替身修補檔滲入或程式碼變動，保留先前失敗。任何未跑／被停止／失敗不得標記完成。

## 5. 獨立驗證與可審查交付

- [x] 5.1 全新且獨立於實作者的 agy Gemini 3.8 Flash High session 依 verify-change 檢查兩個新 capability、所有 scenario、原斷言、正式 source diff、完整選集及每組退出結果；附獨立報告，修正 findings 後重測／複審，無未解重大問題。
- [ ] 5.2 將完整證據與回滾指示提交、push；更新兩個 change 的 tasks／最新驗證文件與兩個 PR 描述，執行 strict validate 與 apply progress 確認沒有未完成必要任務或假綠燈。

## Workflow follow-up

- 全部 tracked tasks 與原摘要驗收任務有證據完成後，依 OpenSpec archive 流程同步兩個 change 的 main specs，strict validate 封存結果並修正失效連結。
- 封存／交付文件另行 commit、push，確認原摘要 Pi source 未被本 change 改寫；只有驗收完整時移除 draft。
- 不自動 merge GitHub PR、不部署、不動正式服務／資料庫，不開始摘要第二階段。
