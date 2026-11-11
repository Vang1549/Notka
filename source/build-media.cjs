// Keep all code local to the signed APK; no CDN or runtime dependency downloads.
require('esbuild').buildSync({entryPoints:['app/media-export.js'],bundle:true,format:'iife',target:'es2020',minify:true,outfile:'app/media-export.bundle.js'});
