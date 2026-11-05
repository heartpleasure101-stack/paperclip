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

## 3. GitHub enrollment 因果修復

- [x] 3.1 在隔離快照取得 ack=0 的因果證據（工作者 poll 結果／errors、HTTP 階段、delivery 狀態、虛擬時鐘／真實 I/O）；有界證明是哪一階段未完成，記錄 real-timer 或受控延遲對照，禁止只延長等待。
- [x] 3.2 依設計決策修復正確擁有者：test-only 時鐘協調／fixture，或經真實依賴證明有缺陷的最小 event/enrollment 服務；以失敗前後與受控故障證明修正生效，保留所有簽名、DB、身分替換、ack 及 25 分鐘安靜期斷言。
- [x] 3.3 執行 enrollment 原案例多次及相關 connection-work／connector 安全回歸，附明確命令與輸出；將根因、採取／未採取方案、原斷言保留與限制記入有日期的 doc/plans 驗證文件。

## 4. 整合與完整覆蓋驗證

- [x] 4.1 將修復分支以一般 merge commit 整合進原摘要 branch，記錄兩個 PR、merge SHA 與修復／Pi source tree；只做本機 merge 與普通 push，不 merge GitHub PR、不 force-push。
- [x] 4.2 在不可變整合快照上通過 preflight、全部已知 blocker 及摘要去重相關回歸，再執行 typecheck/build；每項附退出碼，未通過則不跑昂貴全量。
- [x] 4.3 用官方 dry-run 取得完整入口及分組／分片 inventory，證明 chat、general excluding chat/native、native-runner、workspaces-a/b/c、serialized 無遺漏；依本機資源限制並行並保存實際選集。
- [ ] 4.4 執行全部官方等價測試組，每組／shard 皆保留命令、退出碼、tests／skips、版本及 log；確認每個必要組 exit=0、無測試替身修補檔滲入或程式碼變動，保留先前失敗。任何未跑／被停止／失敗不得標記完成。

## 5. 獨立驗證與可審查交付

- [ ] 5.1 全新且獨立於實作者的 agy Gemini 3.8 Flash High session 依 verify-change 檢查兩個新 capability、所有 scenario、原斷言、正式 source diff、完整選集及每組退出結果；附獨立報告，修正 findings 後重測／複審，無未解重大問題。
- [ ] 5.2 將完整證據與回滾指示提交、push；更新兩個 change 的 tasks／最新驗證文件與兩個 PR 描述，執行 strict validate 與 apply progress 確認沒有未完成必要任務或假綠燈。

## Workflow follow-up

- 全部 tracked tasks 與原摘要驗收任務有證據完成後，依 OpenSpec archive 流程同步兩個 change 的 main specs，strict validate 封存結果並修正失效連結。
- 封存／交付文件另行 commit、push，確認原摘要 Pi source 未被本 change 改寫；只有驗收完整時移除 draft。
- 不自動 merge GitHub PR、不部署、不動正式服務／資料庫，不開始摘要第二階段。
