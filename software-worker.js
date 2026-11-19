import { createRasterizer } from './software-raster.js';
let raster;
self.onmessage = ({data}) => {
  try {
    if (data.type === 'init') { raster=createRasterizer(data.model); return; }
    if (data.type === 'texture') { raster.setTexture(data.data); return; }
    const {width,height}=data.payload, pixels=raster.frame(data.payload);
    self.postMessage({width,height,pixels:pixels.buffer},[pixels.buffer]);
  } catch (error) { self.postMessage({error:String(error)}); }
};
