import {useEffect,useRef,useState} from 'react';
import {DeviceEventEmitter,Modal,Pressable,ScrollView,Text,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {QrCode} from '../channels/weixin/QrCode';
import {QqError} from '../channels/qq/protocol';
import {cancelQqValidation,closeQqValidation,confirmQqValidationQr,downloadQqValidation,qqValidationBound,readQqValidation,requestQqValidationQr} from './qqProbe';
export function QqValidationModal(){
 const[visible,setVisible]=useState(false),[qr,setQr]=useState(''),[bound,setBound]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const alive=useRef(false),running=useRef(false),generation=useRef(0);
 useEffect(()=>{const sub=DeviceEventEmitter.addListener('lime-open-qq-validation',()=>{alive.current=true;const current=++generation.current;setQr('');setMessage('');setVisible(true);void qqValidationBound().then(value=>{if(alive.current && generation.current===current)setBound(value);}).catch(()=>{});});return()=>{sub.remove();alive.current=false;closeQqValidation();};},[]);
 const close=()=>{alive.current=false;generation.current++;closeQqValidation();setVisible(false);setQr('');};
 async function run(fn:(active:()=>boolean)=>Promise<void>){if(running.current)return;running.current=true;setBusy(true);setMessage('');const current=generation.current,active=()=>alive.current && current===generation.current;try{await fn(active);}catch(error){if(active())setMessage(error instanceof QqError?'QQ验证未完成：'+error.code:'QQ验证未完成，请重试。');}finally{running.current=false;if(alive.current)setBusy(false);}}
 const button=(label:string,fn:()=>void,disabled=false)=><Pressable accessibilityRole="button" accessibilityLabel={label} onPress={fn} disabled={disabled} style={{padding:12,opacity:disabled?0.4:1}}><Text style={{color:'#226b3b'}}>{label}</Text></Pressable>;
 return <Modal visible={visible} onRequestClose={close}><SafeAreaView style={{flex:1,backgroundColor:'#fff'}}>{button('关闭QQ验证',close)}<ScrollView contentContainerStyle={{padding:18,gap:12}}>
 <Text>QQ独立能力验证</Text><Text>仅开发验证沙箱。前台读取约60秒；群聊和非绑定本人不保存。关闭应用期间的补收仍需实测。不会发送消息或调用模型。</Text><Text>{bound?'QQ验证已绑定':'QQ验证尚未绑定'}</Text>
 {button('获取QQ验证二维码',()=>void run(async active=>{const display=await requestQqValidationQr();if(active())setQr(display);}),busy)}
 {qr?<View><QrCode value={qr} label="QQ绑定二维码"/><Text>用QQ扫一扫，确认后回到这里查询。二维码仅留在当前窗口。</Text>{button('查询QQ验证绑定',()=>void run(async active=>{const status=await confirmQqValidationQr();if(!active())return;setMessage(status===2?'QQ验证绑定成功。':status===3?'QQ二维码已过期，请重新获取。':'等待QQ扫码确认。');if(status===2){setQr('');setBound(true);}if(status===3)setQr('');}),busy)}</View>:null}
 {button('读取QQ验证消息',()=>void run(async active=>{const result=await readQqValidation();if(active())setMessage(`QQ保存${result.saved}，重复${result.duplicates}；${result.mode==='resumed'?'本次恢复旧会话':'本次新会话'}${result.invalidSession?'，旧会话失效':''}。`);}),busy||!bound)}
 {button('下载QQ验证附件',()=>void run(async active=>{const result=await downloadQqValidation();if(active())setMessage(`QQ附件保存${result.saved}，失败${result.failed}，已有${result.skipped}。`);}),busy||!bound)}
 {busy?button('停止QQ验证操作',cancelQqValidation):null}<Text accessibilityLabel="QQ验证提示">{message}</Text>
 </ScrollView></SafeAreaView></Modal>;
}
