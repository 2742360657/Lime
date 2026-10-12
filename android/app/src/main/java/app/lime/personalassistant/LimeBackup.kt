package app.lime.personalassistant

import android.net.Uri
import com.facebook.react.ReactPackage
import com.facebook.react.bridge.*
import com.facebook.react.uimanager.ViewManager
import org.json.JSONArray
import org.json.JSONObject
import java.io.*
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.UUID
import java.util.concurrent.Executors
import java.util.zip.ZipEntry
import java.util.zip.ZipInputStream
import java.util.zip.ZipOutputStream

// Standard Android ZIP/streams/hash providers; never extracts a caller-supplied path.
class LimeBackupModule(private val context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {
  override fun getName() = "LimeBackup"
  private val worker = Executors.newSingleThreadExecutor()
  private val packageLimit = 256L * 1024 * 1024
  private val manifestLimit = 25L * 1024 * 1024
  private val materialLimit = 10L * 1024 * 1024
  private val hex = Regex("[a-f0-9]{64}")
  private val token = Regex("[a-f0-9-]{36}")
  private fun cache() = File(context.cacheDir, "lime-backup").apply { mkdirs() }
  private fun materials() = File(context.filesDir, "lime-materials").apply { mkdirs() }
  private fun archives() = File(context.filesDir, "lime-backups").apply { mkdirs() }
  private fun uri(file: File) = Uri.fromFile(file).toString()
  private fun digest() = MessageDigest.getInstance("SHA-256")
  private fun hex(bytes: ByteArray) = bytes.joinToString("") { "%02x".format(it) }
  private fun hash(file: File): String {
    val d = digest(); file.inputStream().use { input -> val b=ByteArray(32768); while(true) { val n=input.read(b); if(n<0)break; d.update(b,0,n) } }; return hex(d.digest())
  }
  private fun safePrivate(value: String, allowCache: Boolean = false): File {
    val u = Uri.parse(value); require(u.scheme == "file" && u.authority.isNullOrEmpty() && u.query == null && u.fragment == null) { "FORMAT" }
    val file = File(u.path ?: "").canonicalFile
    val roots = mutableListOf(materials(),archives()); if(allowCache)roots.add(cache())
    require(roots.any { file.path.startsWith(it.canonicalPath + File.separator) }) { "FORMAT" }
    return file
  }
  private fun work(promise: Promise, fn: () -> Any?) {
    worker.execute { try { promise.resolve(fn()) } catch(e:Exception) {
      val code = e.message?.takeIf { it in listOf("FORMAT","LIMIT","MISSING_FILE","INTEGRITY") } ?: "IO"
      promise.reject(code,"Local backup operation failed ($code)")
    } }
  }
  private fun copy(input: InputStream, output: OutputStream, cap: Long, onBytes: (Int)->Unit = {}): Long {
    var total=0L; val b=ByteArray(32768)
    while(true) { val n=input.read(b); if(n<0)break; total+=n; require(total<=cap) { "LIMIT" }; onBytes(n); output.write(b,0,n) }
    return total
  }
  @ReactMethod fun inspect(value: String, role: String, promise: Promise) = work(promise) {
    require(role in listOf("material","archive")) { "FORMAT" }; val file=safePrivate(value)
    require(file.isFile) { "MISSING_FILE" }; require(file.length() <= if(role=="material")materialLimit else packageLimit) { "LIMIT" }
    JSONObject().put("uri",uri(file)).put("hash",hash(file)).put("size",file.length()).toString()
  }
  @ReactMethod fun pack(manifest: String, descriptors: String, promise: Promise) = work(promise) {
    val metadata=manifest.toByteArray(Charsets.UTF_8); require(metadata.size<=manifestLimit) { "LIMIT" }
    val blobs=JSONArray(descriptors); require(blobs.length()<=1023) { "LIMIT" }
    val id=UUID.randomUUID().toString(); val dir=File(cache(),id).apply { mkdirs() }; val target=File(dir,"package.zip")
    try {
      var total=metadata.size.toLong(); val names=mutableSetOf<String>()
      ZipOutputStream(BufferedOutputStream(target.outputStream())).use { zip ->
        zip.putNextEntry(ZipEntry("manifest.json").apply { time=0 });zip.write(metadata);zip.closeEntry()
        for(i in 0 until blobs.length()) {
          val b=blobs.getJSONObject(i); val expected=b.getString("hash"); require(hex.matches(expected) && names.add(expected)) { "FORMAT" }
          val role=b.getString("role"); require(role in listOf("material","archive")) { "FORMAT" }
          val file=safePrivate(b.getString("uri"));require(file.isFile) { "MISSING_FILE" }
          val size=b.getLong("size");require(size>=0 && file.length()==size && size<=if(role=="material")materialLimit else packageLimit) { "INTEGRITY" }
          total+=size;require(total<=packageLimit) { "LIMIT" }
          zip.putNextEntry(ZipEntry("blobs/$expected.bin").apply { time=0 })
          val d=digest();var written=0L
          file.inputStream().use { input -> val buffer=ByteArray(32768);while(true) { val n=input.read(buffer);if(n<0)break;written+=n;require(written<=size) { "INTEGRITY" };d.update(buffer,0,n);zip.write(buffer,0,n) } }
          require(written==size && hex(d.digest())==expected) { "INTEGRITY" };zip.closeEntry()
        }
      }
      require(target.length()<=packageLimit) { "LIMIT" }
      JSONObject().put("id",id).put("uri",uri(target)).put("size",target.length()).put("digest",hash(target)).toString()
    } catch(e:Exception) { dir.deleteRecursively();throw e }
  }
  @ReactMethod fun unpack(value: String, promise: Promise) = work(promise) {
    val u=Uri.parse(value)
    require(u.scheme=="content" || u.scheme=="file") { "FORMAT" }
    if(u.scheme=="file")safePrivate(value,true)
    if(u.scheme=="content")require(u.authority?.startsWith(context.packageName+".")!=true) { "FORMAT" }
    val id=UUID.randomUUID().toString(); val dir=File(cache(),id).apply { mkdirs() };val target=File(dir,"package.zip")
    try {
      context.contentResolver.openInputStream(u)?.use { input -> target.outputStream().use { copy(input,it,packageLimit) } } ?: error("IO")
      var total=0L;var count=0; var manifest:String?=null;val seen=mutableSetOf<String>();val blobs=JSONArray()
      ZipInputStream(BufferedInputStream(target.inputStream())).use { zip ->
        while(true) {
          val entry=zip.nextEntry ?: break
          require(++count<=1024 && !entry.isDirectory && seen.add(entry.name)) { "FORMAT" }
          val hashName=if(entry.name=="manifest.json") null else Regex("blobs/([a-f0-9]{64})\\.bin").matchEntire(entry.name)?.groupValues?.get(1) ?: error("FORMAT")
          val cap=if(hashName==null)manifestLimit else packageLimit
          require(entry.size<0 || entry.size<=cap) { "LIMIT" }
          val output:OutputStream = if(hashName==null) ByteArrayOutputStream() else File(dir,hashName).outputStream()
          val size=output.use { copy(zip,it,cap) { n -> total+=n;require(total<=packageLimit) { "LIMIT" } } }
          if(hashName==null) {
            val bytes=(output as ByteArrayOutputStream).toByteArray()
            manifest=Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes)).toString()
          } else {
            val file=File(dir,hashName);require(hash(file)==hashName) { "INTEGRITY" }
            blobs.put(JSONObject().put("hash",hashName).put("size",size))
          }
          zip.closeEntry()
        }
      }
      require(manifest!=null) { "FORMAT" }
      JSONObject().put("id",id).put("uri",uri(target)).put("size",target.length()).put("digest",hash(target)).put("manifest",manifest).put("blobs",blobs).toString()
    } catch(e:Exception) { dir.deleteRecursively();throw e }
  }
  private fun stage(id: String): File { require(token.matches(id)) { "FORMAT" };return File(cache(),id) }
  private fun installFile(source: File, target: File, expected: String) {
    require(source.isFile && hash(source)==expected) { "INTEGRITY" }
    if(target.exists()) { require(hash(target)==expected) { "INTEGRITY" };return }
    val temp=File(target.parentFile,"${UUID.randomUUID()}.part")
    try { FileOutputStream(temp).use { out -> source.inputStream().use { copy(it,out,packageLimit) };out.fd.sync() };require(temp.renameTo(target)) { "IO" } } finally { temp.delete() }
  }
  @ReactMethod fun install(id: String, promise: Promise) = work(promise) {
    val dir=stage(id);val source=File(dir,"package.zip");require(source.isFile) { "MISSING_FILE" }
    val digest=hash(source);val original=File(archives(),"$digest.zip");installFile(source,original,digest)
    val paths=JSONObject()
    for(file in dir.listFiles() ?: emptyArray()) if(hex.matches(file.name)) {
      val target=File(materials(),"restore-${file.name}.bin");installFile(file,target,file.name);paths.put(file.name,uri(target))
    }
    JSONObject().put("archiveUri",uri(original)).put("paths",paths).toString()
  }
  @ReactMethod fun writeTo(id: String, value: String, promise: Promise) = work(promise) {
    val source=File(stage(id),"package.zip");require(source.isFile && source.length()<=packageLimit) { "MISSING_FILE" }
    val u=Uri.parse(value);require(u.scheme=="content" && u.authority?.startsWith(context.packageName+".")!=true) { "FORMAT" }
    context.contentResolver.openOutputStream(u,"wt")?.use { out -> source.inputStream().use { copy(it,out,packageLimit) } } ?: error("IO")
    null
  }
  @ReactMethod fun fixture(kind: String, promise: Promise) = work(promise) {
    require(BuildConfig.DEBUG && kind in listOf("traversal","unknown","badHash","large")) { "FORMAT" }
    val id=UUID.randomUUID().toString();val dir=File(cache(),id).apply { mkdirs() };val target=File(dir,"package.zip")
    try {
      ZipOutputStream(target.outputStream()).use { zip ->
        zip.putNextEntry(ZipEntry("manifest.json"))
        if(kind=="large") { val zeros=ByteArray(4096);repeat(8192) { zip.write(zeros) } } else zip.write("{}".toByteArray())
        zip.closeEntry()
        if(kind!="large") {
          val name=when(kind) { "traversal" -> "../outside.txt"; "unknown" -> "unexpected.txt"; else -> "blobs/${"a".repeat(64)}.bin" }
          zip.putNextEntry(ZipEntry(name));zip.write("synthetic".toByteArray());zip.closeEntry()
        }
      }
      JSONObject().put("id",id).put("uri",uri(target)).toString()
    } catch(e:Exception) { dir.deleteRecursively();throw e }
  }
  @ReactMethod fun copyOut(value: String, target: String, promise: Promise) = work(promise) {
    val source=safePrivate(value);require(source.isFile && source.length()<=packageLimit) { "MISSING_FILE" }
    val u=Uri.parse(target);require(u.scheme=="content" && u.authority?.startsWith(context.packageName+".")!=true) { "FORMAT" }
    context.contentResolver.openOutputStream(u,"wt")?.use { out -> source.inputStream().use { copy(it,out,packageLimit) } } ?: error("IO")
    null
  }
  @ReactMethod fun discard(id: String, promise: Promise) = work(promise) { stage(id).deleteRecursively();null }
}
class LimeBackupPackage : ReactPackage {
  override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> = listOf(LimeBackupModule(context))
  override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*,*>> = emptyList()
}
