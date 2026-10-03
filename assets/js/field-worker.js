// Renders page-background tiles off the main thread, so scrolling never waits for them.
// Loaded by mountField() in neural-engine.js; ?engine= is the engine script URL.
self.window = self;
self.document = { createElement: function () { return new OffscreenCanvas(1, 1); } };
importScripts(new URL(self.location.href).searchParams.get('engine'));

var model = null, gen = 0;
self.onmessage = function (e) {
  var m = e.data;
  if (m.type === 'init') { gen = m.gen; model = self.LLMEngine.fieldModel(m.opts); return; }
  if (m.type === 'tile' && model && m.gen === gen) {
    var out = model.renderTile(m.i);
    var bitmap = out.canvas.transferToImageBitmap();
    self.postMessage({ gen: m.gen, i: m.i, bitmap: bitmap, live: out.live }, [bitmap]);
  }
};
