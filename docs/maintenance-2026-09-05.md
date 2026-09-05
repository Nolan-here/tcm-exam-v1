# 2026-09-05 功能维护验收记录

## 范围与基线

正式目录为 `D:\Codex\Projects\tcm-exam-v1`。实际 Git 起点为 `main` / `9d336debbe5fb6edc8625d68edd752fc90f850dc`，远程为 `Nolan-here/tcm-exam-v1`，工作区起初干净。依据当前 `AGENTS.md`、`README.md`、`PROJECT_STATE.md`、`DECISIONS.md`、实际源码与现有测试，不使用历史聊天代替验收要求。

当前 UI 为首页、随机/科目复习、四单元考试与本地错题本。没有筛选、分类、批量清空、备份导入导出或同步入口，因此本轮不新增这些功能。存量兼容字段与底层测试继续保留。

只读阶段先核实测试副作用：`npm test` 的 pretest 重建忽略的 Worker 资产，Pages 测试重建 `pages-dist`。随后按授权执行一轮基线、修复针对性测试、最后一轮完整回归；浏览器均使用独立上下文，持久化重开测试使用本项目 `tmp/maintenance-browser/profile-*` 临时配置。没有读取或清理用户真实站点数据。

## 确认的问题与修复

首页问题在三种模式各“开始后返回”“作答后返回”的六条真实路径复现，公共 `#live-status` 中分别保留开始复习、开始考试或进入错题本的消息；Chrome Accessibility Tree 同样含有旧文字。`setView` 原来只重绘主区域，而公共通知位于其外；`requestAnimationFrame` 和保存完成后的通知也没有页面生命周期保护。

现在页面切换清空真实 DOM、取消待执行通知，并以切换代次阻止旧异步操作更新界面或焦点。三模式连续切换、同帧快速返回、保存期间返回及返回后重进同模式均通过；答题状态仍由原生单选名称反馈，开始、翻页和交卷通知仍在当前场景有效。

其他修复为：错题本移出页末题后先定位下一题所在页再聚焦；考试结果为 A3 错题补回原有共用题干；确认按钮在提交进行中禁用，避免连续激活跳过题型；IndexedDB 仅在 transaction complete 后兑现保存，abort/error 拒绝；SW 只淘汰本项目前缀缓存；保留的 Worker 构建补齐实际模块依赖（原缺项返回 404）。正式交付仍使用 Pages，没有部署 Sites 或修改访问权限。

## 错题本验收对照

| 需求/预期 | 依据 | 实现 | 验证 | 结果 |
| --- | --- | --- | --- | --- |
| 首页直接进入全部错题，不出现分类中间页 | DECISIONS 2026-08-31、README | startWrongBook / renderWrongBook | 入口与完整浏览器测试 | 通过 |
| 上线后复习错选立即收集，考试仅最终提交收集错题与未答题 | 同上 | saveImmediateFeedbackAnswer / submitExam | 随机、科目和考试真实路径；确认页返回检查 | 通过 |
| 考试修改答案以最终选择为准 | PROJECT_STATE 考试规则 | exam.answers 与 submitExam | 先错后对、先对后错、148 道未答，交卷前为空 | 通过，提交后 149 条 |
| 稳定 ID 合并来源、次数、时间 | README、wrong-book 当前数据模型 | recordWrongBookEntry | 同 ID review/exam 合并；createdAt/updatedAt 断言 | 通过，保持既有计数口径 |
| 答对保留记录，同一入库周期保持答对资格 | DECISIONS 2026-08-31 | markWrongBookEntryCorrect | 重进与刷新；再次复习错误后资格保留 | 通过，不自动移出 |
| 移出后重新入库重置答对资格 | README 数据与隐私 | removeWrongBookEntry / recordWrongBookEntry | 单元测试 | 通过 |
| 首次答对折叠且按钮在解析上方，多次答对展开且按钮在下方 | DECISIONS 2026-08-31 方案 B | wrongBookAbout / updateWrongBookAbout | 完整浏览器测试 | 通过 |
| 未答对移出需指定原生确认，取消返回触发按钮 | DECISIONS 2026-08-31 | dialog / close handler | 取消、确认文字、答对直接移出 | 通过自动验证；真人读屏待测 |
| 移出后聚焦下一题，最后一题返回剩余末题或空状态 | DECISIONS 2026-08-31 / 2026-09-05 | removeCurrentWrong | 跨题型页末、末页、空状态、保存时返回 | 原缺陷已修复 |
| 题组块打乱，当前 A3/B1 同组错题相邻且上下文完整 | DECISIONS 2026-08-31 | createShuffledWrongBookIds / renderQuestionPage | 年度及科目 A3/B1 实题；跨页检查题干/选项/答案/解析逐字段对应 | 通过 |
| 分页最多 10 题，不拆当前错题题组 | README、PROJECT_STATE | createQuestionPages / pagination | 多页题组与 149 条错题练习 | 通过 |
| 新旧错题区隔离，旧数据不迁移、不删除 | DECISIONS 2026-08-31 | normalizeState / wrongBook | 上线前无 wrongBook 状态；含旧数据的关闭重开 | 通过 |
| 错题记录保存，临时答题和随机顺序不恢复 | PROJECT_STATE 错题本 | wrongBookSession 独立内存会话 | 首页重进、刷新、关闭重开、离线作答 | 通过 |
| 错题练习不修改其他模式会话 | 独立状态设计与 README 数据规则 | wrongBookSession 与 state 分区 | 复习、考试、旧 wrongs 等完整快照对比 | 通过 |

计数细节未找到更细的产品验收定义：当前 wrongCount 按复习每次错选和每次考试最终错误递增，错题本内重练错选不递增；没有次数显示界面。本轮验证并保留兼容行为，没有把另一套计数规则当作缺陷。

## 回归与证据边界

- 基线：63 项 `npm test` 与现有 Chrome 入口、完整流程通过。新增维护测试最初六项均失败，分别落在旧通知、异步通知、跨页焦点、A3 结果断言；另独立复现连续确认跳型。
- 最终：`npm test` 64/64。Chrome 与 Edge 均通过 `test:browser`、`test:browser:full`、`test:browser:subject-quality` 和 `test:browser:maintenance`（11/11）。入口测试含桌面与移动视口。覆盖原生展开/折叠、Tab/Shift+Tab、Enter/Space、科目隔离、自定义题量、复习反馈、分页、考试锁定/恢复/交卷、错题移出和离线。
- 存储故障注入：只在独立浏览器中让 put 请求成功后中止事务，确认保存拒绝、数据未落盘，后续队列仍保存最新快照。不声称已模拟所有磁盘满、隐私模式或浏览器损坏情况。
- 旧缓存升级：在独立 HTTP 来源实际运行 `git show 9d336de` 的旧 HTML/app/db/sw，再切换当前源码。Chrome/Edge 均无需清空数据即升级到 `tcm-exam-v1-20260905-28`，保留错题、复习快照及其他应用缓存，升级后断网进入错题本通过。
- 年度审计：3492 题，0 error、28 warning（23 条原有语义标题符号候选、5 道争议占位解析）；历史 PDF 专项 2502 题，0 error、0 warning。质量扫描仍为 647 候选、457 题、5 道不可用解析、1 组来源答案冲突候选。
- 科目专项：1017 题，0 error；结构审计 2 warning（源格式异常、已排除的 2 道重复题）；质量专项 1 个既有人工复核 warning，29 个启发式候选及 2 组重复解析候选已处置，未处置为 0。医学内容未修改、未重新审校。
- `npm run build` 和 Pages 构建通过；保留既有大题库包体积提示，没有升级依赖或改变框架。
- 未完成真人 NVDA、争渡、VoiceOver / iPhone Safari 验收。重点人工复核首页是否仍朗读旧通知、答题标签更新、跨页移出焦点和确认对话框。存储不可用时的友好错误处理仍是 PROJECT_STATE 中的既有局限，不把事务测试视为完整异常恢复功能。

## 清理证据

`recordActivity` 原用于添加历史活动并截断为 800 项。当前应用导入、事件委托、动态模块、测试、Worker 清单和 Pages 构建均无调用，删除函数但保留 activity 字段及归一化、备份数据。

`goToPage` 第三参数原可指定题目焦点；它是模块内函数，两处实际调用都只有两个参数，动态事件仅传页码与模式，分支不可达。删除该参数及分支，保留正常分页焦点，并给错题移出单独实现必须的可见页定位。

其余休眠备份、同步、旧题库模块、历史数据及兼容路径仍有测试或构建用途，继续保留。没有删除既有临时目录、重要数据或用户文件。

## 发布核验约定

本次按现有 `main` → GitHub Actions → GitHub Pages 流程交付。提交前核对精确差异，CI 新增维护浏览器测试；不得用本地通过代替提交、远程、build/deploy job 和公开资源检查。最终提交与线上检查结果以本次交付回复和实际 GitHub 工作流为准。
