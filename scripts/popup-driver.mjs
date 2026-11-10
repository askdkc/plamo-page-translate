import { writeFile } from 'node:fs/promises';

// Extension action popups are real page targets but aren't exposed in
// Playwright context.pages(). Attach to that actual popup over CDP.
export async function actionPopup(context) {
  const cdp=await context.browser().newBrowserCDPSession();
  const {targetInfos}=await cdp.send('Target.getTargets');
  const target=targetInfos.find(t=>t.url.endsWith('/popup.html'));
  if(!target) throw new Error('Action popup was not opened.');
  const {sessionId}=await cdp.send('Target.attachToTarget',{targetId:target.targetId,flatten:false});
  let next=0;
  const pending=new Map();
  cdp.on('Target.receivedMessageFromTarget',event=>{
    if(event.sessionId!==sessionId)return;
    const message=JSON.parse(event.message), task=pending.get(message.id);
    if(task){pending.delete(message.id);message.error?task.reject(new Error(message.error.message)):task.resolve(message.result);}
  });
  const send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++next;pending.set(id,{resolve,reject});
    cdp.send('Target.sendMessageToTarget',{sessionId,message:JSON.stringify({id,method,params})}).catch(reject);
  });
  const evaluate=async expression=>{
    const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,userGesture:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };
  return {
    evaluate,
    locator:selector=>({
      innerText:()=>evaluate(`document.querySelector(${JSON.stringify(selector)}).innerText`),
      click:()=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(el.disabled)throw new Error('Button disabled: '+document.body.innerText);el.click();})()`),
    }),
    screenshot:async({path})=>{const {data}=await send('Page.captureScreenshot');await writeFile(path,Buffer.from(data,'base64'));},
  };
}
