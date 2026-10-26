package com.androidsoftwaredaily.habitcheckin

import android.app.Activity
import android.app.Instrumentation
import android.net.Uri
import android.os.Bundle
import java.io.File
import java.security.MessageDigest

/** Runs on an isolated emulator with signed release APK fixtures; no network mocks. */
class UpdateVerifierInstrumentation : Instrumentation() {
  private lateinit var arguments: Bundle
  override fun onCreate(arguments: Bundle?) {
    super.onCreate(arguments)
    this.arguments = arguments ?: Bundle()
    start()
  }
  override fun onStart() {
    val result = Bundle()
    val passed = mutableListOf<String>()
    try {
      val directory = File(targetContext.cacheDir, "updates")
      val version = arguments.getString("fixtureVersion") ?: "1.2.5"
      val code = arguments.getString("fixtureCode")?.toDouble() ?: 10.0
      val valid = File(directory, "lime-$version-x86_64.apk")
      fun hash(file: File): String {
        val digest = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
          val buffer = ByteArray(65536)
          while (true) { val count = input.read(buffer); if (count < 0) break; digest.update(buffer, 0, count) }
        }
        return digest.digest().joinToString("") { "%02x".format(it) }
      }
      val goodHash = hash(valid)
      fun verify(file: File = valid, digest: String = hash(file), expectedCode: Double = code,
                 expectedVersion: String = version, size: Double = file.length().toDouble(), uri: String = Uri.fromFile(file).toString()) =
        ApkUpdateVerifier.validate(targetContext, uri, digest, expectedCode, expectedVersion, size)
      fun rejects(name: String, expected: String, run: () -> Unit) {
        try { run(); error("$name accepted an invalid APK") }
        catch (error: UpdateValidationException) { check(error.code == expected) { "$name: ${error.code}, wanted $expected" } }
        passed.add(name)
      }
      verify(digest = goodHash); passed.add("validSignedNewVersion")
      rejects("wrongHash", "E_UPDATE_HASH") { verify(digest = "0".repeat(64)) }
      rejects("wrongSize", "E_UPDATE_SIZE") { verify(size = valid.length().toDouble() + 1) }
      rejects("wrongVersion", "E_UPDATE_VERSION") { verify(expectedVersion = "0.0.0") }
      rejects("wrongCode", "E_UPDATE_VERSION") { verify(expectedCode = code + 1) }
      rejects("invalidMetadata", "E_UPDATE_METADATA") { verify(expectedCode = Double.NaN) }
      rejects("foreignAuthority", "E_UPDATE_PATH") { verify(uri = "file://foreign${valid.absolutePath}") }
      rejects("contentUri", "E_UPDATE_PATH") { verify(uri = "content://other/update.apk") }
      rejects("outsideCache", "E_UPDATE_PATH") { verify(uri = Uri.fromFile(File(targetContext.filesDir, valid.name)).toString()) }
      rejects("differentSigner", "E_UPDATE_SIGNATURE") { verify(File(directory, "lime-1.2.6-x86_64.apk")) }
      rejects("wrongAbi", "E_UPDATE_ABI") { verify(File(directory, "lime-$version-arm64-v8a.apk")) }
      rejects("foreignPackage", "E_UPDATE_PACKAGE") { verify(File(directory, "lime-1.2.7-x86_64.apk")) }
      rejects("downgrade", "E_UPDATE_VERSION") { verify(File(directory, "lime-1.2.4-x86_64.apk"), expectedCode = 9.0, expectedVersion = "1.2.4") }
      result.putString("passed", passed.joinToString(","))
      result.putString("result", "PASS: ${passed.size} APK verification cases")
      finish(Activity.RESULT_OK, result)
    } catch (error: Throwable) {
      result.putString("error", error.toString())
      result.putString("passed", passed.joinToString(","))
      finish(Activity.RESULT_CANCELED, result)
    }
  }
}
