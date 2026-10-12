# 酸橙 Lime

一款纯本地的 Android 个人管理应用，无账号、无服务器、无网络依赖。

习惯、待办和备忘录的数据完整保存在设备本地，支持导出备份和恢复。

---

## 功能

**习惯打卡**

新建习惯并设置频次（每天 / 每周 / 每月）和目标次数，快速打卡，支持补打历史。习惯可以按分组管理，支持归档。打卡历史可以按月日历查看，也可以添加感受和时间记录。

**待办**

新建待办并设置日期和时间，任务按"逾期 / 今天 / 明天 / 近七天 / 稍后 / 无日期"自动分桶，支持拖动排序和批量整理。完成后可撤销。

**备忘录**

快速写作，自动保存，支持分类、搜索和软删除（回收站可恢复）。

**今日概览**

当天的习惯完成情况和待办汇总。

**主题**

六套内置配色方案：松绿、海蓝、暖棕、柔粉、薄荷、石墨。

**备份与恢复**

在设置页将全部数据导出为 JSON 文件，通过系统分享发送到任意位置；恢复时从文件导入。支持 v1–v7 历史格式迁移。

---

## 下载

前往 [Releases](https://github.com/2742360657/Angelime/releases) 下载最新 APK，安装到 Android 设备（arm64，Android 7.0+）。

> 本应用不上架应用商店，安装时需要在系统设置中允许"安装未知来源应用"。

---

## 仓库结构

```
main              本地版（本仓库），当前主要维护线
extended/dev      扩展版开发分支（含 DeepSeek AI 助手 + 微信/QQ 收件）
```

扩展版基于本仓库追加了 AI 助手、渠道收件和本地通知提醒等功能，暂停主动开发，代码在 `extended/dev` 分支供参考。

---

## 开发环境

- Node 22 + npm
- JDK 17
- Android SDK Platform 36 / Build Tools 36

```bash
npm ci
npm start          # Expo Metro 开发服务器
npm run android    # 安装调试版到已连接设备
npm run typecheck  # TypeScript 类型检查
```

构建 release APK（需要在 `android/` 目录配置签名）：

```bash
npm run build:apk
```

---

## 数据与隐私

所有数据存储在设备本地的 `habit-checkin/data.json`（Expo documentDirectory）。应用不申请网络权限，不联网，不上传任何数据。

备份文件包含全部个人数据，请妥善保管，恢复前确认文件来源可靠。

---

## 许可

MIT License。详见 [NOTICE.md](NOTICE.md)（如有）。
