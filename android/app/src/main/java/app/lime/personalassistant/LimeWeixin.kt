package app.lime.personalassistant

import android.net.Uri
import android.util.Base64
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.spec.SecretKeySpec

// Platform boundary: TLS downloader and the Android provider implement transport/crypto.
class LimeWeixinModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LimeWeixin"
  private val worker = Executors.newSingleThreadExecutor()
  private class Operation { @Volatile var cancelled = false; @Volatile var connection: HttpURLConnection? = null }
  private val operations = ConcurrentHashMap<String, Operation>()
  private val limit = 10 * 1024 * 1024
  private fun root() = File(context.cacheDir, "lime-weixin").apply { mkdirs() }
  private fun hash(bytes: ByteArray, algorithm: String = "SHA-256") = MessageDigest.getInstance(algorithm).digest(bytes).joinToString("") { "%02x".format(it) }
  private fun decode(ciphertext: ByteArray, value: String, encoding: String): ByteArray {
    if (encoding == "plain") { require(value.isEmpty()) { "BAD_KEY" }; return ciphertext }
    require(value.length <= 128) { "BAD_KEY" }
    var key = if (encoding == "hex") {
      require(value.matches(Regex("[a-fA-F0-9]{32}"))) { "BAD_KEY" }
      value.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    } else {
      require(encoding == "base64") { "BAD_KEY" }; Base64.decode(value, Base64.DEFAULT)
    }
    if (key.size == 32) {
      val hex = String(key, Charsets.US_ASCII); require(hex.matches(Regex("[a-fA-F0-9]{32}"))) { "BAD_KEY" }
      key = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
    }
    require(key.size == 16 && ciphertext.isNotEmpty() && ciphertext.size % 16 == 0) { "BAD_KEY" }
    // PKCS5Padding is the Android JCE name for PKCS#7 with AES's 16-byte block size.
    return Cipher.getInstance("AES/ECB/PKCS5Padding").run { init(Cipher.DECRYPT_MODE, SecretKeySpec(key, "AES")); doFinal(ciphertext) }
  }
  private fun validUrl(value: String, fixture: Boolean): URL {
    val uri = Uri.parse(value)
    if (fixture) {
      require(BuildConfig.DEBUG && uri.scheme == "http" && uri.host == "127.0.0.1" && uri.port == 8093 && uri.path == "/media") { "HOST" }
      return URL(value)
    }
    require(value.length <= 20000 && uri.scheme == "https" && uri.host == "novac2c.cdn.weixin.qq.com" && uri.port in listOf(-1, 443)
      && uri.userInfo == null && uri.fragment == null && uri.path == "/c2c/download") { "HOST" }
    return URL(value)
  }
  @ReactMethod fun download(id: String, url: String, key: String, encoding: String, expectedSize: Double, md5: String, promise: Promise) = transfer(id, url, key, encoding, expectedSize, md5, promise, false)
  @ReactMethod fun fixtureDownload(id: String, kind: String, key: String, size: Double, promise: Promise) {
    if (!BuildConfig.DEBUG || kind !in listOf("good", "padding", "large", "redirect", "slow")) { promise.reject("FIXTURE", "Invalid synthetic fixture"); return }
    transfer(id, "http://127.0.0.1:8093/media?kind=$kind", key, "hex", size, "", promise, true)
  }
  private fun transfer(id: String, url: String, key: String, encoding: String, expectedSize: Double, md5: String, promise: Promise, fixture: Boolean) {
    try {
      require(id.matches(Regex("[a-f0-9-]{36}")) && operations.size < 2) { "BUSY" }
      require(expectedSize == -1.0 || expectedSize in 0.0..limit.toDouble() && expectedSize % 1.0 == 0.0) { "TOO_LARGE" }
      require(md5.isEmpty() || md5.matches(Regex("[a-fA-F0-9]{32}"))) { "BAD_HASH" }
      val targetUrl = validUrl(url, fixture); val op = Operation()
      require(operations.putIfAbsent(id, op) == null) { "BUSY" }
      worker.execute {
        val temp = File(root(), "$id.part"); val target = File(root(), "$id.bin")
        var committed = false
        try {
          require(!op.cancelled) { "CANCELLED" }
          val connection = (targetUrl.openConnection() as HttpURLConnection).apply {
            instanceFollowRedirects = false; requestMethod = "GET"; connectTimeout = 15000; readTimeout = 15000
          }
          op.connection = connection; require(!op.cancelled) { "CANCELLED" }
          require(connection.responseCode == 200) { "HTTP" }
          require(connection.contentLengthLong <= limit.toLong() + 16) { "TOO_LARGE" }
          val started = System.nanoTime(); var count = 0
          connection.inputStream.use { input -> temp.outputStream().use { output ->
            val buffer = ByteArray(32768)
            while (true) {
              require(!op.cancelled) { "CANCELLED" }
              require(System.nanoTime() - started < 35_000_000_000L) { "TIMEOUT" }
              val n = input.read(buffer); if (n < 0) break
              count += n; require(count <= limit + 16) { "TOO_LARGE" }; output.write(buffer, 0, n)
            }
          }}
          val bytes = decode(temp.readBytes(), key, encoding)
          require(bytes.size <= limit && (expectedSize < 0 || bytes.size.toDouble() == expectedSize)) { "SIZE" }
          require(md5.isEmpty() || hash(bytes, "MD5").equals(md5, true)) { "BAD_HASH" }
          require(!op.cancelled) { "CANCELLED" }; target.writeBytes(bytes); committed = true
          promise.resolve(JSONObject().put("uri", Uri.fromFile(target).toString()).put("size", bytes.size).put("hash", hash(bytes)).toString())
        } catch (e: Exception) {
          val code = if (op.cancelled) "CANCELLED" else e.message?.takeIf { it in listOf("HOST", "HTTP", "TOO_LARGE", "TIMEOUT", "BAD_KEY", "SIZE", "BAD_HASH") } ?: "MEDIA"
          promise.reject(code, "Weixin media operation failed ($code)")
        } finally { op.connection?.disconnect(); operations.remove(id); temp.delete(); if (!committed) target.delete() }
      }
    } catch (e: Exception) { val code = e.message?.takeIf { it in listOf("HOST", "BUSY", "TOO_LARGE", "BAD_HASH") } ?: "MEDIA"; promise.reject(code, "Weixin media operation failed ($code)") }
  }
  @ReactMethod fun cancel(id: String, promise: Promise) { operations[id]?.let { it.cancelled = true; it.connection?.disconnect() }; promise.resolve(null) }
  @ReactMethod fun discard(uri: String, promise: Promise) {
    try { val file = File(Uri.parse(uri).path ?: "").canonicalFile; require(file.parentFile == root().canonicalFile && file.name.matches(Regex("[a-f0-9-]{36}\\.bin"))); file.delete(); promise.resolve(null) }
    catch (_: Exception) { promise.reject("INVALID_FILE", "Invalid validation download") }
  }
  @ReactMethod fun fixture(ciphertext: String, key: String, encoding: String, promise: Promise) {
    try {
      require(BuildConfig.DEBUG && ciphertext.length <= 4096); val bytes = decode(Base64.decode(ciphertext, Base64.DEFAULT), key, encoding)
      promise.resolve(JSONObject().put("size", bytes.size).put("hash", hash(bytes)).toString())
    } catch (_: Exception) { promise.reject("FIXTURE", "Synthetic media fixture failed") }
  }
}
class LimeWeixinPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(LimeWeixinModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
