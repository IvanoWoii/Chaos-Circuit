import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, resolve, relative, isAbsolute, sep } from 'node:path';
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.json':'application/json'};
/** Explicit public paths keep source helpers, credentials and node_modules private. */
export function staticHandler(root) {
  return async(req,res)=>{
    try {
      if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
      const path=decodeURIComponent(new URL(req.url,'http://local').pathname);
      if(path==='/health'){res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({ok:true,version:'1.5.0'}));return;}
      const publicPath=path==='/'?'/index.html':path;
      if(!/^\/(index\.html|favicon\.svg|styles\.css|hud\.css|menus\.css|js\/[^?]+)$/.test(publicPath)) {res.writeHead(404).end('Not found');return;}
      const file=resolve(root,`.${publicPath}`), local=relative(root,file);
      if(isAbsolute(local)||local.startsWith('..')||local.split(sep).some(s=>s.startsWith('.'))) {res.writeHead(403).end();return;}
      if(!(await stat(file)).isFile())throw Error();
      res.writeHead(200,{'Content-Type':`${types[extname(file)]||'application/octet-stream'}; charset=utf-8`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
      if(req.method==='HEAD')res.end();else createReadStream(file).on('error',()=>res.destroy()).pipe(res);
    }catch{res.writeHead(404).end('Not found');}
  };
}
