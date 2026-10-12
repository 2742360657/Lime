# Lime

An offline Android app for **habits, tasks and memos**. No account or server required. Your data stays in the app's private storage; export and restore JSON backups yourself.

[Download APK](https://github.com/2742360657/Lime/releases/latest) · [Chinese guide](../README.md) · [Development](development.md)

- Habits: optional daily/weekly/monthly goals or free recording, groups, check-ins, history and archiving.
- Tasks: dates and times, date buckets, sorting and completion.
- Memos: autosave, categories, search and a recoverable trash bin.
- Today overview, six color themes, local profile and JSON backup/restore.

Android 7.0+. Choose arm64-v8a for most phones or x86_64 for compatible emulators. v1.2.0 uses a new private signing key because the legacy key was exposed in Git history. Older releases cannot be upgraded in place: export and verify a JSON backup first, then uninstall the old app, install v1.2.0 and restore the backup. Later releases with the same new signature can be installed in place.

The main release has no network permission, advertising or analytics. File sharing happens only through the system picker/share UI when requested. Backup JSON is not encrypted. See [privacy](privacy.md).

For development, use Node 22, JDK 17 and Android SDK 36: `npm ci`, `npm run check`, then `npm start`. `npm run build:preview` creates a standalone development-signed APK. Agents should read [AGENTS.md](../AGENTS.md).

main is the maintained offline app. extended/dev contains a separately installable AI/messaging test edition; it is not included in the offline APK. See the [AI edition](ai-edition.md). Licensed under [MIT](../LICENSE).
