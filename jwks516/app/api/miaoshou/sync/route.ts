import {createHmac} from "crypto";
import {NextResponse} from "next/server";

const PATH="/open/v1/order/package/fetch/search_package_list";
const BASE="https://openapi-erp.91miaoshou.com";
type Account={id:string;name:string;appKey:string;secret:string};

function getAccounts():Account[]{
  const numbered:Account[]=[];
  for(let i=1;i<=10;i++){
    const appKey=process.env[`MIAOSHOU_ACCOUNT_${i}_APP_KEY`];
    const secret=process.env[`MIAOSHOU_ACCOUNT_${i}_APP_SECRET`];
    if(appKey&&secret)numbered.push({id:String(i),name:process.env[`MIAOSHOU_ACCOUNT_${i}_NAME`]||`妙手账号${i}`,appKey,secret});
  }
  if(numbered.length)return numbered;
  const appKey=process.env.MIAOSHOU_APP_KEY,secret=process.env.MIAOSHOU_APP_SECRET;
  return appKey&&secret?[{id:"1",name:"妙手账号1",appKey,secret}]:[];
}

export async function GET(){
  return NextResponse.json({accounts:getAccounts().map(({id,name})=>({id,name}))});
}

async function fetchAccount(account:Account,input:any){
  const body={page:Number(input.page||1),pageSize:Math.min(Number(input.pageSize||100),100),...(input.platform?{platform:input.platform}:{}),...(input.shopIds?.length?{shopIds:input.shopIds}:{}),...(input.status?{appPackageStatus:input.status}:{}),...(input.modifiedFrom?{gmtModifiedFrom:input.modifiedFrom}:{}),...(input.modifiedTo?{gmtModifiedTo:input.modifiedTo}:{})};
  const bodyJson=JSON.stringify(body),timestamp=Math.floor(Date.now()/1000).toString();
  const sign=createHmac("sha256",account.secret).update(account.secret+PATH+timestamp+account.appKey+bodyJson+account.secret).digest("hex");
  const response=await fetch(BASE+PATH,{method:"POST",headers:{"content-type":"application/json","x-app-key":account.appKey,"x-timestamp":timestamp,"x-sign":sign},body:bodyJson,cache:"no-store"});
  const raw=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(`妙手返回错误 ${response.status}`);
  if(raw?.code&&!['200',200,'0',0].includes(raw.code)&&raw?.result!==true&&raw?.result!=="success")throw new Error(raw?.message||`妙手错误 ${raw.code}`);
  const containers=Array.isArray(raw?.data)?raw.data:[raw?.data].filter(Boolean);
  const packages=containers.flatMap((x:any)=>Array.isArray(x?.orderPackageList)?x.orderPackageList:[]).map((x:any)=>({...x,_accountId:account.id,_accountName:account.name}));
  return packages;
}

export async function POST(request:Request){
  const accounts=getAccounts();
  if(!accounts.length)return NextResponse.json({ok:false,message:"请先在Vercel中填写妙手账号密钥"},{status:503});
  try{
    const input=await request.json().catch(()=>({}));
    const selected=input.accountId&&input.accountId!=="all"?accounts.filter(a=>a.id===String(input.accountId)):accounts;
    if(!selected.length)return NextResponse.json({ok:false,message:"没有找到这个妙手账号"},{status:404});
    const results=await Promise.allSettled(selected.map(a=>fetchAccount(a,input)));
    const packages=results.flatMap(r=>r.status==="fulfilled"?r.value:[]);
    const errors=results.map((r,i)=>r.status==="rejected"?`${selected[i].name}：${r.reason?.message||"同步失败"}`:null).filter(Boolean);
    if(results.every(r=>r.status==="rejected"))return NextResponse.json({ok:false,message:errors.join("；")},{status:502});
    return NextResponse.json({ok:true,packages,count:packages.length,message:errors.length?`部分账号失败：${errors.join("；")}`:"同步完成",errors});
  }catch(error){return NextResponse.json({ok:false,message:error instanceof Error?error.message:"同步失败"},{status:500})}
}
