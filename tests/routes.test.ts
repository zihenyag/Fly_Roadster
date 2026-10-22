import { test } from 'node:test';
import assert from 'node:assert/strict';
import { autoRouteHtml } from '../scripts/staticRoutes';

test('the nested auto route resolves the same scripts and styles as the root Pages release',()=>{
  const root='<html><head><script type="module" src="./assets/app.js"></script><link href="./assets/style.css"></head><body><div id="app"></div></body></html>';
  const nested=autoRouteHtml(root),base=new URL('../','https://zihenyag.github.io/Fly_Roadster/auto/');
  assert.ok(nested.indexOf('<base href="../">')<nested.indexOf('<script'));
  assert.equal(new URL('./assets/app.js',base).href,'https://zihenyag.github.io/Fly_Roadster/assets/app.js');
  assert.equal(new URL('./assets/style.css',base).href,'https://zihenyag.github.io/Fly_Roadster/assets/style.css');
  assert.equal(nested.replace('\n    <base href="../">',''),root);
});
