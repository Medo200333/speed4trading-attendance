import base from "./vite.config";
import {nitro} from "nitro/vite";
export default async function desktop(environment:Parameters<typeof base>[0]) {
 const config=await base({...environment,command:"serve",isPreview:false});
 return {...config,plugins:[...config.plugins,nitro({preset:"node-server",serverDir:"./server",output:{dir:"dist-server"}})]};
}
