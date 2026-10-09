# P3 材料入口与分析契约

日期：2026-10-09。本批实现范围先冻结；通过情况在阶段结束填写。

## 数据与入口

文件选择器不预先复制到Expo缓存，授权content URI直接交给有界复制；不删除提供方原件。所有入口共用手机私有复制和SQLite材料仓储：文件选择、Android SEND/SEND_MULTIPLE、文件VIEW。每件原件最多10MiB，每次最多6件，入站队列最多40批；复制时限流而不是只信提供方的size。只接收content URI；应用内部文件读写限制到专用材料目录。共享文字/URL作为UTF-8文本保存，不自动抓取网页。

Native持久入站批次先保存原件和结果，再通知JS；JS提交SQLite导入回执后确认批次。崩溃重开重新导入按批次回执和内容SHA-256去重，失败条目明确展示；不同批次中相同原件复用，不重复建业务任务。文件存储成功不等于模型分析授权。

新增local_materials（原件/格式/解析/版本/状态）与local_material_imports（批次导入回执）。原件不可原地改写，解析/纠正或归档增加revision。聊天草稿保存选中的版本，发送创建固定来源快照；材料不自动成为长期记忆。重试和接受建议都检查当前来源版本。

## 格式和限制

- UTF-8 txt/md/csv/json/log：保留原件，正文上限32000字符；非法编码/二进制/超长不静默截断。
- JPEG/PNG/WebP及静态GIF首帧：保留原件；用Android Bitmap生成有界JPEG分析副本（最长边1600px）。模型视觉结果不是原文/OCR确定结果。
- PDF：Android35+文本提取，20页以内、正文32000字符；无文字页可渲染供视觉处理，每轮总共最多6张图。低版本、加密/损坏、超限或渲染失败保留原件并解释限制，不宣称全部PDF成功。
- Office和其他格式：保存原件，可导出到外部应用，暂不解析；无需新服务器或桌面转换引擎。

本轮最多4件来源（记录与附件合计），文字总长度32000、图片总数据8MiB。发送前显示类型/解析限制；不支持项可存但不能伪装成已分析。系统接收后不会自动发模型请求。

## 模型与来源

SourceRef沿用{id,revision}，附件增加kind:'attachment'；旧日记引用保持兼容。domain、建议确认和runtime在确定性边界检查kind/版本/未归档，模型不能借ID读取未选择的附件。只发送当轮选定文本/分析图片，不发送手机content URI、文件路径或全库。后续轮次不自动重发材料正文/图片及其回答。

已有AI SDK/DeepSeek provider负责多模态消息序列化，图片内嵌仅本次请求，暂不使用云Files持久上传。来源快照可离线查看正文和对应原件，接受后的待办可回看来源。材料归档不删除原件；物理回收与全对象备份在P5处理。

## 原生适配选择

复用Expo DocumentPicker/FileSystem/Sharing（外部分享），Android ContentResolver/Bitmap/PdfRenderer。已安装Expo55接收分享仍实验性，当前源码resolver会自动请求URL、重名缓存覆盖、拷贝错误后仍返回路径，且ACTION_VIEW及text/plain文件不能统一处理。本批使用小型Android适配补齐有界复制、持久批次和VIEW，不复制第三方框架或引入第二套接收库。平台API解析，不自己编写PDF/OCR引擎。

依据：[Expo55分享](https://docs.expo.dev/versions/v55.0.0/sdk/sharing/)、[Android接收分享](https://developer.android.com/training/sharing/receive)、[PdfRenderer.Page](https://developer.android.com/reference/android/graphics/pdf/PdfRenderer.Page)、[DeepSeek视觉](https://api-docs.deepseek.com/guides/vision/)。版本兼容和实际能力在集中验收记录；文档不是完成证据。
