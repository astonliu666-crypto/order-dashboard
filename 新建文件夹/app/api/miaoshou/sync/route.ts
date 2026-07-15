import {createHmac} from "crypto";
import {NextResponse} from "next/server";

const PATH="/open/v1/order/package/fetch/search_package_list";
const BASE="https://openapi-erp.91miaoshou.com";

export async function POST(request:Request){
  const appKey=process.env.MIAOSHOU_APP_KEY;
  const secret=process.env.MIAOSHOU_APP_SECRET;
  if(!appKey||!secret)return NextResponse.json({ok:false,message:"请先在Vercel中填写妙手AppKey和AppSecret"},{status:503});
  try{
    const input=await request.json().catch(()=>({}));
    const body={page:Number(input.page||1),pageSize:Math.min(Number(input.pageSize||100),100),...(input.platform?{platform:input.platform}:{}),...(input.shopIds?.length?{shopIds:input.shopIds}:{}),...(input.status?{appPackageStatus:input.status}:{}),...(input.modifiedFrom?{gmtModifiedFrom:input.modifiedFrom}:{}),...(input.modifiedTo?{gmtModifiedTo:input.modifiedTo}:{})};
    const bodyJson=JSON.stringify(body),timestamp=Math.floor(Date.now()/1000).toString();
    const text=secret+PATH+timestamp+appKey+bodyJson+secret;
    const sign=createHmac("sha256",secret).update(text).digest("hex");
    const response=await fetch(BASE+PATH,{method:"POST",headers:{"content-type":"application/json","x-app-key":appKey,"x-timestamp":timestamp,"x-sign":sign},body:bodyJson,cache:"no-store"});
    const raw=await response.json().catch(()=>null);
    if(!response.ok)return NextResponse.json({ok:false,message:`妙手返回错误 ${response.status}`,detail:raw},{status:502});
    const containers=Array.isArray(raw?.data)?raw.data:[raw?.data].filter(Boolean);
    const packages=containers.flatMap((x:any)=>Array.isArray(x?.orderPackageList)?x.orderPackageList:[]);
    const success=raw?.result===true||raw?.result==="success"||raw?.code==="200"||raw?.code===200||packages.length>=0;
    return NextResponse.json({ok:success,packages,count:packages.length,code:raw?.code,message:raw?.message||"同步完成",rawCount:containers.length});
  }catch(error){return NextResponse.json({ok:false,message:error instanceof Error?error.message:"同步失败"},{status:500})}
}
