// Keep committed engineering and an intentional prebuild consistent. No clean prebuild.
const { withAndroidManifest, withMainActivity, withMainApplication } = require('expo/config-plugins');
module.exports = function withLimeMaterials(config) {
  config = withAndroidManifest(config, mod => {
    const activity = mod.modResults.manifest.application[0].activity.find(a => a.$['android:name'] === '.MainActivity');
    const filters = activity['intent-filter'] ??= [];
    for (const [actions, data] of [
      [['android.intent.action.SEND', 'android.intent.action.SEND_MULTIPLE'], { 'android:mimeType': '*/*' }],
      [['android.intent.action.VIEW'], { 'android:scheme': 'content', 'android:mimeType': '*/*' }],
    ]) {
      if (!filters.some(f => f.action?.some(a => a.$['android:name'] === actions[0]))) filters.push({ action: actions.map(name => ({ $: { 'android:name': name } })), category: [{ $: { 'android:name': 'android.intent.category.DEFAULT' } }], data: [{ $: data }] });
    }
    return mod;
  });
  config = withMainActivity(config, mod => {
    if (mod.modResults.language !== 'kt') throw new Error('Lime materials require the committed Kotlin activity.');
    let s = mod.modResults.contents;
    if (!s.includes('import android.content.Intent')) s = s.replace('import android.os.Build', 'import android.content.Intent\nimport android.os.Build');
    if (!s.includes('MaterialFiles.capture(applicationContext, intent)')) {
      s = s.replace('setTheme(R.style.AppTheme)', 'MaterialFiles.capture(applicationContext, intent)\n    setTheme(R.style.AppTheme)');
      s = s.replace('  override fun getMainComponentName()', '  override fun onNewIntent(intent: Intent) {\n    MaterialFiles.capture(applicationContext, intent)\n    super.onNewIntent(intent)\n    setIntent(intent)\n  }\n\n  override fun getMainComponentName()');
    }
    mod.modResults.contents = s; return mod;
  });
  return withMainApplication(config, mod => {
    if (!mod.modResults.contents.includes('add(LimeMaterialsPackage())')) mod.modResults.contents = mod.modResults.contents.replace('PackageList(this).packages.apply {', 'PackageList(this).packages.apply {\n          add(LimeMaterialsPackage())');
    return mod;
  });
};
