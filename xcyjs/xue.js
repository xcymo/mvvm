// 监听变化：Observer

class Observer {
  constructor(data) {
    this.data = data;
    this.walk(data);
  }

  walk (data) {
    Object.keys(data).forEach(key => {
      this.convert(key, data[key]);
    });
  }


  convert (key, val) {
    this.defineReactive(this.data, key, val);
  }
  defineReactive (data, key, val) {
    var dep = new Dep();
    var childObj = observe(val);

    Object.defineProperty(data, key, {
      enumerable: true,
      configurable: false,
      get () {
        if (Dep.target) {
          dep.depend();
        }
        return val;
      },
      set (newVal) {
        if (newVal === val) {
          return;
        }
        console.log(
          "监听到了" + key + "的变化：" + val + "--->" + newVal
        );
        val = newVal;
        childObj = observe(newVal);
        dep.notify(); // 通知变化
      }
    });
  }
}

function observe (value) {
  if (!value || typeof value != "object") {
    return;
  }
  return new Observer(value);
}

let uid = 0;
class Dep {
  constructor() {
    this.id = uid++;
    this.subs = [];
  }

  addSub (sub) {
    this.subs.push(sub);
    console.log(this.subs);
  }
  depend () {
    Dep.target.addDep(this);
  }

  removeSub (sub) {
    let index = this.subs.indexOf(sub);
    if (index != -1) {
      this.subs.splice(index, 1);
    }
  }

  notify () {
    this.subs.forEach(sub => {
      sub.update();
    });
  }
}
Dep.target = null;


// 解析指令：Compile
class Compile {
  constructor(el, vm) {
    this.$vm = vm; //vm是MVVM实例
    this.$el = this.isElementNode(el) ? el : document.querySelector(el);

    if (this.$el) {
      this.$fragment = this.node2Fragment(this.$el);
      this.init();
      this.$el.appendChild(this.$fragment); //这一步很奇怪，没看到这个函数改变任何东西？fragment还是那个fragment
    }
  }

  node2Fragment (el) {
    let fragment = document.createDocumentFragment();
    let child;
    while ((child = el.firstChild)) {
      fragment.appendChild(child);
    }
    return fragment;
  }
  init () {
    this.compileElement(this.$fragment);
  }
  compileElement (el) {
    let childNodes = el.childNodes;

    [].slice.call(childNodes).forEach(node => {
      let text = node.textContent;
      let reg = /\{\{(.*)\}\}/;
      if (this.isElementNode(node)) {
        this.compile(node)
      } else if (this.isTextNode(node) && reg.test(text)) {
        this.compileText(node, RegExp.$1);
      }
      if (node.childNodes && node.childNodes.length) {
        this.compileElement(node);
      }
    });
  }

  compile (node) {
    let nodeAttrs = node.attributes;
    [].slice.call(nodeAttrs).forEach(attr => {
      let attrName = attr.name;
      console.log(attr);
      if (this.isDirective(attrName)) {
        let exp = attr.value;
        let dir = attrName.substring(2);

        if (this.isEventDirective(dir)) {
          compileUtil.eventHandler(node, this.$vm, exp, dir);
        } else {
          compileUtil[dir] && compileUtil[dir](node, this.$vm, exp);
        }

        node.removeAttribute(attrName); //没懂，为啥要移除属性
      }
    });

  }

  compileText (node, exp) {
    compileUtil.text(node, this.$vm, exp);
  }

  isDirective (attr) { //判断是不是MVVM指令
    return attr.indexOf("v-") == 0;
  }

  isEventDirective (dir) {
    return dir.indexOf("on") == 0;
  }

  isElementNode (node) {
    return node.nodeType == 1;
  }

  isTextNode (node) {
    return node.nodeType == 3;
  }
}

let compileUtil = {
  text: function (node, vm, exp) {
    this.bind(node, vm, exp, "text");
  },

  html: function (node, vm, exp) {
    this.bind(node, vm, exp, "html");
  },

  model: function (node, vm, exp) {
    this.bind(node, vm, exp, "model");

    let val = this._getVMVal(vm, exp);

    node.addEventListener("input", e => {
      let newValue = e.target.value;
      if (val === newValue) {
        return;
      }

      this._setVMVal(vm, exp, newValue);
      val = newValue;
    });
  },

  class: function (node, vm, exp) {
    this.bind(node, vm, exp, "class");
  },

  bind: function (node, vm, exp, dir) {
    let updaterFn = updater[dir + "Updater"];

    updaterFn && updaterFn(node, this._getVMVal(vm, exp));

    new Watcher(vm, exp, function (value, oldValue) {
      updaterFn && updaterFn(node, value, oldValue);
    });
  },

  // 事件处理
  eventHandler: function (node, vm, exp, dir) {
    let eventType = dir.split(":")[1];
    let fn = vm.$options.methods && vm.$options.methods[exp];

    if (eventType && fn) {
      node.addEventListner(eventType, fn.bind(vm), false);
    }
  },

  _getVMVal: function (vm, exp) {
    let val = vm;
    exp = exp.split(".");
    exp.forEach(k => {
      val = val[k];
    });
    return val;
  },

  _setVMVal: function (vm, exp, value) {
    let val = vm;
    exp = exp.split(".");
    exp.forEach((k, i) => {
      if (i < exp.length - 1) {
        val = val[k];
      } else {
        val[k] = value;
      }
    });
  }
};

let updater = {
  textUpdater: function (node, value) {
    node.textContent = typeof value == "undefined" ? "" : value;
  },

  htmlUpdater: function (node, value) {
    node.innerHTML = typeof value == "undefined" ? "" : value;
  },

  classUpdater: function (node, value, oldValue) {
    let className = node.className;
    className = className.replace(oldValue, "").replace(/\$/, "");

    let space = className && String(value) ? " " : "";

    node.className = className + space + value;
  },

  modelUpdater: function (node, value, oldValue) {
    node.value = typeof value == "undefined" ? "" : value;
  }
};

// 实现watcher

class Watcher {
  constructor(vm, expOrFn, cb) { //vm,key,callback
    this.cb = cb;
    this.vm = vm;
    this.expOrFn = expOrFn;
    this.depIds = {};
    console.log(typeof expOrFn);
    if (typeof expOrFn == "function") {
      this.getter = expOrFn;
    } else {
      this.getter = this.parseGetter(expOrFn);
    }
    this.value = this.get();
  }

  update () {
    this.run();
  }

  run () {
    let value = this.get();
    let oldVal = this.value;
    if (value !== oldVal) {
      this.value = value;
      this.cb.call(this.vm, value, oldVal);
    }
  }
  addDep (dep) {
    console.log(dep);
    if (!this.depIds.hasOwnProperty(dep.id)) {
      dep.addSub(this);
      console.log(dep);
      this.depIds[dep.id] = dep;
    }
  }

  get () {
    Dep.target = this;
    let value = this.getter.call(this.vm, this.vm); // 这里会触发属性的getter，从而添加订阅者
    Dep.target = null;
    return value;
  }

  parseGetter (exp) {
    if (/[^\w.$]/.test(exp)) {
      return;
    }
    console.log(exp);
    let exps = exp.split(".");

    return function (obj) {
      console.log(obj);
      for (let item of exps) {
        if (!obj) {
          return;
        }
        obj = obj[item];
        console.log(obj);
      }
      return obj;
    };
  }
}

class MVVM {
  constructor(options) {
    this.$options = options;
    this._data = this.$options.data;
    let data = this._data;
    Object.keys(data).forEach(key => {
      this._proxyData(key); //传说中的数据代理
      this.$watch(key);
    });

    this._initComputed();
    observe(data, this);
    this.$compile = new Compile(options.el, this);
  }

  $watch (key, cb, options) {
    new Watcher(this, key, cb);
  }

  _proxyData (key, setter, getter) {
    let _this = this;
    setter =
      setter ||
      Object.defineProperty(this, key, {
        configurable: false,
        enumerable: true,
        get: function proxyGetter () {
          return _this._data[key];
        },
        set: function proxySetter (newVal) {
          _this._data[key] = newVal;
        }
      });
  }

  _initComputed () {
    let computed = this.$options.computed;
    if (typeof computed === "object") {
      Object.keys(computed).forEach(key => {
        Object.defineProperty(this, key, {
          get: typeof computed[key] === "function" ?
            computed[key] : computed[key].get,
          set () { }
        });
      });
    }
  }
}