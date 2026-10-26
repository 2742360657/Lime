package com.androidsoftwaredaily.habitcheckin

import android.content.Context
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.pm.PackageInfoCompat
import java.io.File
import java.security.MessageDigest
import java.util.zip.ZipFile

class UpdateValidationException(val code: String, message: String) : Exception(message)

/** Installation is restricted to verified files in our private update cache. */
object ApkUpdateVerifier {
  private fun reject(code: String, message: String): Nothing = throw UpdateValidationException(code, message)
  private val signingFlags: Int
    get() = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES

  fun current(context: Context): PackageInfo = context.packageManager.getPackageInfo(context.packageName, signingFlags)

  @Suppress("DEPRECATION")
  fun certificates(info: PackageInfo): List<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { signature ->
      MessageDigest.getInstance("SHA-256").digest(signature.toByteArray()).joinToString("") { "%02x".format(it) }
    }?.sorted() ?: emptyList()
  }

  fun validate(context: Context, uri: String, sha256: String, expectedCode: Double, expectedVersion: String, expectedSize: Double): File {
    if (!sha256.matches(Regex("[a-f0-9]{64}")) || !expectedCode.isFinite() || expectedCode < 1 || expectedCode > Int.MAX_VALUE ||
        expectedCode != expectedCode.toLong().toDouble() || !expectedSize.isFinite() || expectedSize < 1 || expectedSize > 200 * 1024 * 1024 ||
        expectedSize != expectedSize.toLong().toDouble()) reject("E_UPDATE_METADATA", "安装包信息异常，请重新检查更新。")
    val parsed = Uri.parse(uri)
    if (parsed.scheme != "file" || !parsed.authority.isNullOrEmpty()) reject("E_UPDATE_PATH", "安装包位置无效，请重新下载。")
    val file = File(parsed.path ?: "").canonicalFile
    val directory = File(context.cacheDir, "updates").canonicalFile
    if (file.parentFile != directory || !file.name.matches(Regex("lime-\\d+\\.\\d+\\.\\d+-(arm64-v8a|x86_64)\\.apk")) || !file.isFile) {
      reject("E_UPDATE_PATH", "安装包位置无效，请重新下载。")
    }
    if (file.length() != expectedSize.toLong()) reject("E_UPDATE_SIZE", "安装包下载不完整，请重新下载。")
    val digest = MessageDigest.getInstance("SHA-256")
    file.inputStream().buffered().use { input ->
      val buffer = ByteArray(64 * 1024)
      while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
    }
    val actualHash = digest.digest().joinToString("") { "%02x".format(it) }
    if (actualHash != sha256) reject("E_UPDATE_HASH", "安装包校验失败，请重新下载。")
    val archive = context.packageManager.getPackageArchiveInfo(file.absolutePath, signingFlags)
      ?: reject("E_UPDATE_PACKAGE", "无法读取安装包，请重新下载。")
    val installed = current(context)
    if (archive.packageName != context.packageName) reject("E_UPDATE_PACKAGE", "安装包不属于当前应用，已停止安装。")
    val code = PackageInfoCompat.getLongVersionCode(archive)
    if (code != expectedCode.toLong() || code <= PackageInfoCompat.getLongVersionCode(installed) || archive.versionName != expectedVersion) {
      reject("E_UPDATE_VERSION", "安装包版本不匹配或不是新版，已停止安装。")
    }
    val signatures = certificates(archive)
    if (signatures.isEmpty() || signatures != certificates(installed)) reject("E_UPDATE_SIGNATURE", "安装包签名不匹配，已停止安装。")
    val abis = ZipFile(file).use { zip ->
      zip.entries().asSequence().mapNotNull { Regex("lib/([^/]+)/[^/]+\\.so").matchEntire(it.name)?.groupValues?.get(1) }.toSet()
    }
    if (Build.SUPPORTED_ABIS.none { abis.contains(it) }) reject("E_UPDATE_ABI", "安装包不适用于此设备。")
    return file
  }
}
