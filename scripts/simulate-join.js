const fs = require('fs');
const vm = require('vm');
const path = require('path');

class ClassList {
  constructor() {
    this._ = new Set();
  }

  add(...cls) {
    cls.forEach((c) => this._.add(c));
  }

  remove(...cls) {
    cls.forEach((c) => this._.delete(c));
  }

  contains(c) {
    return this._.has(c);
  }

  toggle(c, force) {
    if (force === true) this.add(c);
    else if (force === false) this.remove(c);
    else if (this.contains(c)) this.remove(c);
    else this.add(c);
  }
}

function makeEl(id, tag = 'div') {
  const el = {
    id,
    tagName: tag.toUpperCase(),
    className: '',
    classList: new ClassList(),
    style: {},
    dataset: {},
    children: [],
    value: '',
    disabled: false,
    textContent: '',
    hidden: false,
    offsetWidth: 800,
    offsetHeight: 600,
    scrollLeft: 0,
    scrollTop: 0,
    clientWidth: 800,
    clientHeight: 600,
    addEventListener() {},
    removeEventListener() {},
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    remove() {},
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 800, height: 600 };
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    closest() {
      return null;
    },
  };
  return el;
}

const ids = [
  'login-screen', 'board-screen', 'username-input', 'join-btn', 'board', 'board-wrap',
  'board-empty', 'file-input', 'add-image-btn', 'note-form', 'note-input', 'online-count',
  'host-info', 'host-urls', 'host-info-login', 'host-urls-login', 'toast', 'draw-canvas',
];

const elements = Object.fromEntries(ids.map((id) => {
  const tag = id.includes('input') ? 'input' : id.includes('btn') ? 'button' : 'div';
  return [id, makeEl(id, tag)];
}));

elements['board-screen'].classList.add('hidden');

const document = {
  getElementById: (id) => elements[id] || null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  createElement: (tag) => makeEl('', tag),
  body: makeEl('body'),
};

class FakeSocket {
  constructor() {
    this.connected = false;
    this._handlers = {};
    setTimeout(() => {
      this.connected = true;
      (this._handlers.connect || []).forEach((fn) => fn());
    }, 0);
  }

  on(evt, fn) {
    this._handlers[evt] = this._handlers[evt] || [];
    this._handlers[evt].push(fn);
    return this;
  }

  emit(evt, ...args) {
    (this._handlers[evt] || []).forEach((fn) => fn(...args));
    return this;
  }

  removeAllListeners() {
    this._handlers = {};
    return this;
  }

  disconnect() {
    this.connected = false;
  }
}

const window = {
  document,
  location: { hostname: 'localhost' },
  addEventListener: () => {},
  ResizeObserver: class {
    observe() {}
  },
  devicePixelRatio: 1,
  drawModule: null,
};

const context = {
  window,
  document,
  console,
  setTimeout,
  clearTimeout,
  fetch: async () => ({
    ok: true,
    json: async () => ({ urls: ['http://localhost:3000'], localUrl: 'http://localhost:3000', port: 3000 }),
  }),
  io: () => new FakeSocket(),
  Map,
};

context.globalThis = context;
window.window = window;

const root = path.join(__dirname, '..');
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/draw.js'), 'utf8'), context);
window.drawModule = context.window.drawModule;
vm.runInNewContext(fs.readFileSync(path.join(root, 'public/app.js'), 'utf8'), context);

function runSimulateJoin() {
  return new Promise((resolve, reject) => {
    if (typeof context.window.joinBoard !== 'function') {
      reject(new Error('joinBoard not defined'));
      return;
    }

    context.window.joinBoard();

    setTimeout(() => {
      const loginHidden = elements['login-screen'].classList.contains('hidden');
      const boardVisible = !elements['board-screen'].classList.contains('hidden');

      if (!loginHidden || !boardVisible) {
        reject(new Error(`screen did not switch: ${JSON.stringify({ loginHidden, boardVisible })}`));
        return;
      }

      console.log('OK: joinBoard switches screens');
      resolve();
    }, 50);
  });
}

if (require.main === module) {
  runSimulateJoin().catch((err) => {
    console.error('FAIL:', err.message);
    process.exit(1);
  });
}

module.exports = { runSimulateJoin };
