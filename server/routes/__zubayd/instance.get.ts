import {defineEventHandler} from "h3";
export default defineEventHandler(()=>({appId:"com.zubayd.accesscontrol",instance:process.env.ZUBAYD_INSTANCE_ID||""}));
