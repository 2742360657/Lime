package com.androidsoftwaredaily.habitcheckin

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import androidx.core.content.pm.PackageInfoCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.module.annotations.ReactModule
import java.io.File
import java.util.concurrent.Executors

@ReactModule(name = LimeUpdateModule.NAME)
class LimeUpdateModule(private val context: ReactApplicationContext) : NativeLimeUpdaterSpec(context) {
  private val worker = Executors.newSingleThreadExecutor()
  override fun getName() = NAME

  override fun getInstalledInfo(promise: Promise) {
    try {
      val info = ApkUpdateVerifier.current(context)
      val result = Arguments.createMap()
      result.putString("applicationId", context.packageName)
      result.putString("version", info.versionName.orEmpty())
      result.putDouble("versionCode", PackageInfoCompat.getLongVersionCode(info).toDouble())
      result.putInt("sdk", Build.VERSION.SDK_INT)
      result.putArray("supportedAbis", Arguments.fromArray(Build.SUPPORTED_ABIS))
      result.putString("certificateSha256", ApkUpdateVerifier.certificates(info).joinToString(","))
      result.putString("updateDirectoryUri", Uri.fromFile(File(context.cacheDir, "updates")).toString() + "/")
      promise.resolve(result)
    } catch (error: Exception) { promise.reject("E_UPDATE_INFO", "无法读取当前安装包信息。", error) }
  }

  private fun allowed() = Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()
  override fun canInstallPackages(promise: Promise) { promise.resolve(allowed()) }

  override fun verifyApk(uri: String, sha256: String, versionCode: Double, version: String, size: Double, promise: Promise) {
    worker.execute {
      try { ApkUpdateVerifier.validate(context, uri, sha256, versionCode, version, size); promise.resolve(true) }
      catch (error: Exception) { failure(promise, error) }
    }
  }

  override fun installApk(uri: String, sha256: String, versionCode: Double, version: String, size: Double, promise: Promise) {
    worker.execute {
      try {
        val file = ApkUpdateVerifier.validate(context, uri, sha256, versionCode, version, size)
        UiThreadUtil.runOnUiThread {
          try {
            val activity = context.currentActivity
            if (activity == null) { promise.reject("E_UPDATE_ACTIVITY", "请返回应用后再次点击安装。"); return@runOnUiThread }
            if (!allowed()) {
              activity.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + context.packageName)))
              promise.resolve("permission")
            } else {
              val contentUri = FileProvider.getUriForFile(context, context.packageName + ".updates", file)
              val intent = Intent(Intent.ACTION_VIEW).setDataAndType(contentUri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
              activity.startActivity(intent)
              promise.resolve("installer")
            }
          } catch (error: Exception) { promise.reject("E_UPDATE_INSTALL", "无法打开系统安装界面，请打开发布页手动安装。", error) }
        }
      } catch (error: Exception) { failure(promise, error) }
    }
  }

  private fun failure(promise: Promise, error: Exception) {
    if (error is UpdateValidationException) promise.reject(error.code, error.message)
    else promise.reject("E_UPDATE_VERIFY", "无法校验安装包，请重新下载。", error)
  }
  override fun invalidate() { worker.shutdownNow(); super.invalidate() }
  companion object { const val NAME = "NativeLimeUpdater" }
}
