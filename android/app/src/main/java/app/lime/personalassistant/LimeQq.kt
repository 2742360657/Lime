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
import java.nio.ByteBuffer
import java.nio.charset.CodingErrorAction
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.util.concurrent.TimeUnit

class LimeQqModule(private val context: ReactApplicationContext):ReactContextBaseJavaModule(context){
  override fun getName()="LimeQq"
  private val worker=Executors.newSingleThreadExecutor()
  private class Operation{@Volatile var cancelled=false;@Volatile var connection:HttpURLConnection?=null}
  private val operations=ConcurrentHashMap<String,Operation>();private val limit=10*1024*1024
  private val sockets=ConcurrentHashMap<String,WebSocket>()
  private val wsClient=OkHttpClient.Builder().followRedirects(false).followSslRedirects(false).connectTimeout(15,TimeUnit.SECONDS).readTimeout(0,TimeUnit.SECONDS).build()
  private fun emit(id:String,type:String,data:String="",code:Int=0){
    val event=Arguments.createMap().apply{putString("id",id);putString("type",type);putString("data",data);putInt("code",code)}
    context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java).emit("lime-qq-ws",event)
  }
  @ReactMethod fun addListener(name:String){}
  @ReactMethod fun removeListeners(count:Double){}
  @ReactMethod fun connectWs(id:String,url:String,promise:Promise)=connect(id,url,promise,false)
  @ReactMethod fun fixtureWs(id:String,mode:String,promise:Promise){
    if(!BuildConfig.DEBUG || mode !in listOf("new","resume","invalid","silent","redirect")){promise.reject("FIXTURE","Unknown QQ WS fixture");return}
    connect(id,"ws://127.0.0.1:8094/ws?mode=$mode",promise,true)
  }
  private fun connect(id:String,url:String,promise:Promise,fixture:Boolean){
    try{
      require(id.matches(Regex("[a-f0-9-]{36}")) && !sockets.containsKey(id) && sockets.size<2)
      val u=Uri.parse(url)
      if(fixture)require(BuildConfig.DEBUG && u.scheme=="ws" && u.host=="127.0.0.1" && u.port==8094 && u.path=="/ws")
      else require(url.length<=2048 && u.scheme=="wss" && u.host in listOf("api.sgroup.qq.com","api.bot.qq.com") && u.port in listOf(-1,443) && u.userInfo==null && u.fragment==null && u.path?.startsWith("/websocket")==true)
      val ws=wsClient.newWebSocket(Request.Builder().url(url).build(),object:WebSocketListener(){
        override fun onOpen(webSocket:WebSocket,response:Response){emit(id,"open")}
        override fun onMessage(webSocket:WebSocket,text:String){if(text.toByteArray(Charsets.UTF_8).size>1024*1024){emit(id,"error");webSocket.cancel();return};emit(id,"message",text)}
        override fun onMessage(webSocket:WebSocket,bytes:ByteString){emit(id,"error");webSocket.cancel()}
        override fun onClosing(webSocket:WebSocket,code:Int,reason:String){webSocket.close(code,null)}
        override fun onClosed(webSocket:WebSocket,code:Int,reason:String){sockets.remove(id);emit(id,"close",code=code)}
        override fun onFailure(webSocket:WebSocket,t:Throwable,response:Response?){sockets.remove(id);emit(id,"error")}
      })
      sockets[id]=ws;promise.resolve(null)
    }catch(_:Exception){promise.reject("HOST","QQ WebSocket rejected")}
  }
  @ReactMethod fun sendWs(id:String,data:String,promise:Promise){
    try{require(data.toByteArray(Charsets.UTF_8).size<=8192);require(sockets[id]?.send(data)==true);promise.resolve(null)}catch(_:Exception){promise.reject("NETWORK","QQ WebSocket send failed")}
  }
  @ReactMethod fun closeWs(id:String,promise:Promise){sockets.remove(id)?.cancel();promise.resolve(null)}
  private fun root()=File(context.cacheDir,"lime-qq").apply{mkdirs()}
  private fun hash(bytes:ByteArray)=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it)}
  @ReactMethod fun decrypt(ciphertext:String,key:String,promise:Promise){
    try{
      require(key.matches(Regex("[A-Za-z0-9+/]{43}=")) && ciphertext.length in 40..4096 && ciphertext.matches(Regex("[A-Za-z0-9+/]+={0,2}")))
      val secret=Base64.decode(key,Base64.NO_WRAP);val packet=Base64.decode(ciphertext,Base64.NO_WRAP);require(secret.size==32 && packet.size>28)
      val clear=Cipher.getInstance("AES/GCM/NoPadding").run{init(Cipher.DECRYPT_MODE,SecretKeySpec(secret,"AES"),GCMParameterSpec(128,packet.copyOfRange(0,12)));doFinal(packet.copyOfRange(12,packet.size))}
      val text=Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(clear)).toString();require(text.isNotEmpty() && text.length<=512);promise.resolve(text)
    }catch(_:Exception){promise.reject("SESSION","QQ encrypted credential rejected")}
  }
  private fun validUrl(value:String,fixture:Boolean):URL{
    val u=Uri.parse(value)
    if(fixture){require(BuildConfig.DEBUG && u.scheme=="http" && u.host=="127.0.0.1" && u.port==8094 && u.path=="/media");return URL(value)}
    require(value.length<=16384 && u.scheme=="https" && u.host in listOf("grouptalk.c2c.qq.com","multimedia.nt.qq.com.cn","multimedia.nt.qq.com","gchat.qpic.cn","c2cpicdw.qpic.cn") && u.port in listOf(-1,443) && u.userInfo==null && u.fragment==null){"HOST"};return URL(value)
  }
  @ReactMethod fun download(id:String,url:String,size:Double,promise:Promise)=transfer(id,url,size,promise,false)
  @ReactMethod fun fixtureDownload(id:String,kind:String,size:Double,promise:Promise){
    if(!BuildConfig.DEBUG || kind !in listOf("text","image","large","redirect","slow")){promise.reject("FIXTURE","Unknown QQ fixture");return}
    transfer(id,"http://127.0.0.1:8094/media?kind=$kind",size,promise,true)
  }
  private fun transfer(id:String,url:String,size:Double,promise:Promise,fixture:Boolean){
    try{
      require(id.matches(Regex("[a-f0-9-]{36}")) && operations.size<2){"BUSY"};require(size == -1.0 || size in 0.0..limit.toDouble() && size%1.0==0.0){"TOO_LARGE"}
      val targetUrl=validUrl(url,fixture);val op=Operation();require(operations.putIfAbsent(id,op)==null){"BUSY"}
      worker.execute{
        val temp=File(root(),"$id.part");val target=File(root(),"$id.bin");var committed=false
        try{
          require(!op.cancelled){"CANCELLED"};val connection=(targetUrl.openConnection() as HttpURLConnection).apply{instanceFollowRedirects=false;connectTimeout=15000;readTimeout=15000;requestMethod="GET"}
          op.connection=connection;require(!op.cancelled){"CANCELLED"};require(connection.responseCode==200){"HTTP"};require(connection.contentLengthLong<=limit){"TOO_LARGE"}
          val start=System.nanoTime();var count=0
          connection.inputStream.use{input->temp.outputStream().use{output->val buffer=ByteArray(32768);while(true){require(!op.cancelled){"CANCELLED"};require(System.nanoTime()-start<35_000_000_000L){"TIMEOUT"};val n=input.read(buffer);if(n<0)break;count+=n;require(count<=limit){"TOO_LARGE"};output.write(buffer,0,n)}}}
          require(size<0 || count.toDouble()==size){"SIZE"};require(!op.cancelled){"CANCELLED"};require(temp.renameTo(target));committed=true
          promise.resolve(JSONObject().put("uri",Uri.fromFile(target).toString()).put("size",count).put("hash",hash(target.readBytes())).toString())
        }catch(e:Exception){val code=if(op.cancelled)"CANCELLED" else e.message?.takeIf{it in listOf("HTTP","TOO_LARGE","TIMEOUT","SIZE")}?:"MEDIA";promise.reject(code,"QQ media operation failed ($code)")}
        finally{op.connection?.disconnect();operations.remove(id);temp.delete();if(!committed)target.delete()}
      }
    }catch(e:Exception){val code=e.message?.takeIf{it in listOf("HOST","BUSY","TOO_LARGE")}?:"MEDIA";promise.reject(code,"QQ media operation failed ($code)")}
  }
  @ReactMethod fun cancel(id:String,promise:Promise){operations[id]?.let{it.cancelled=true;it.connection?.disconnect()};promise.resolve(null)}
  @ReactMethod fun discard(uri:String,promise:Promise){try{val file=File(Uri.parse(uri).path?:"").canonicalFile;require(file.parentFile==root().canonicalFile && file.name.matches(Regex("[a-f0-9-]{36}\\.bin")));file.delete();promise.resolve(null)}catch(_:Exception){promise.reject("INVALID_FILE","Invalid QQ download")}}
}
class LimeQqPackage:ReactPackage{
  override fun createNativeModules(context:ReactApplicationContext):List<NativeModule> = listOf(LimeQqModule(context))
  override fun createViewManagers(context:ReactApplicationContext):List<ViewManager<*,*>> = emptyList()
}
