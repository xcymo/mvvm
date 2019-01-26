// 监听变化：Observer

class Observer {
	constructor(data) {
		this.data = data;
	}
	walk() {
		Object.keys(this.data).forEach(key => {
			this.defineReactive(this.data, key, this.data[key]);
		});
	}

	defineReactive(data, key, val) {
		var dep = new Dep();
		var childObj = observe(val);

		Object.defineProperty(data, key, {
			enumerable: true,
			configurable: false,
			get() {
				if (Dep.target) {
					dep.depend();
				}
				return val;
			},
			set(newVal) {
				if (newVal === val) {
					return;
				}
				console.log(
					"监听到了" + key + "的变化：" + val + "--->" + newVal
				);
				val = newVal;
				childObj = observe(newVal);
				dep.notify();
			}
		});
	}
}

function observe(value) {
	if (!value || typeof value != "object") {
		return;
	}
	return new Object(value);
}

let uid = 0;
class Dep {
	// static target;
	constructor() {
		this.id = uid++;
		this.subs = [];
	}

	addSub(sub) {
		this.subs.push(sub);
	}
	depend() {
		console.log(Dep);
		Dep.target.addDep(this);
	}
	removeSub(sub) {
		let index = this.subs.indexOf(sub);
		if (index != -1) {
			this.subs.splice(index, 1);
		}
	}
	notify() {
		console.log("notify");
		this.subs.forEach(sub => {
			sub.update();
		});
	}
}
Dep.target = null;

// 解析指令：Compile
class Compile {
	constructor(el, vm) {
		this.$el = this.isElementNode(el) ? el : document.querySelector(el);
		this.$vm = vm;
		if (this.$el) {
			this.$fragment = this.node2Fragment(this.$el);
			this.init();
			this.$el.appendChild(this.$fragment);
		}
	}

	init() {
		this.compileElement(this.$fragment);
	}
	node2Fragment(el) {
		let fragment = document.createDocumentFragment;
		let child;
		while ((child = el.firstChild)) {
			fragment.appendChild(child);
		}
		return fragment;
	}
	compileElement(el) {
		let chileNodes = el.chileNodes;
		[].slice.call(chileNodes).forEach(node => {
			let text = node.textContent;
			let reg = /\{\{(.*)\}\}/;

			if (this.isElementNode(node)) {
				this.compileElement(node);
			} else if (this.isTextNode(node) && reg.test(text)) {
				this.compileText(node, RegExp.$1);
			}
			if (node.chileNodes && node.chileNodes.length) {
				this.compileElement(node);
			}
		});
	}

	compile(node) {
		let nodeAttrs = node.attributes;

		[].slice.call(nodeAttrs).forEach(attr => {
			let attrName = attr.name;

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

	compileText(node, exp) {
		compileUtil.text(node, this.$vm, exp);
	}

	isDirective(attr) {
		return attr.indexOf("v-") == 0;
	}

	isEventDirective(dir) {
		return dir.indexOf("on") == 0;
	}

	isElementNode(node) {
		return node.nodeType == 1;
	}

	isTextNode(node) {
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
		node.addEventListner("input", e => {
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
	constructor(vm, expOrFn, cb) {
		this.cb = cb;
		this.vm = vm;
		this.expOrFn = expOrFn;
		this.depIds = {};

		if (typeof expOrFn == "function") {
			this.getter = expOrFn;
		} else {
			this.getter = this.parseGetter(expOrFn);
		}

		this.value = this.get();
	}

	update() {
		this.run();
	}

	run() {
		let value = this.get();
		let oldVal = this.value;
		if (val !== oldVal) {
			this.value = value;
			this.cb.call(this.vm, value, oldVal);
		}
	}

	addDep(dep) {
		if (!this.depIds.hasOwnProperty(dep.id)) {
			dep.addSub(this);
			this.depIds[dep.id] = dep;
		}
	}

	get() {
		Dep.target = this;
		let value = this.getter.call(this.vm, this.vm);
		Dep.target = null;
		return value;
	}

	parseGetter(exp) {
		if (/[^\w.$]/.text(exp)) {
			return;
		}

		let exps = exp.split(".");

		return function (obj) {
			for (let item of exps) {
				if (!obj) {
					return;
				}
				obj = item;
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
			this._proxyData(key);
		});

		this._initComputed();
		observe(data, this);
		this.$compile = new Compile(options.el, this);
	}

	$watch(key, cb, options) {
		new Watcher(this, key, cb)
	}

	_proxyData(key, setter, getter) {
		let _this = this;
		setter = setter || Object.defineProperty(this, key, {
			configurable: false,
			enumerable: true,
			get: function proxyGetter() {
				return _this._data[key]
			},
			set: function proxySetter(newVal) {
				_this._data[key] = newVal;
			}
		})
	}

	_initComputed() {
		let computed = this.$options.computed;
		if (typeof computed === 'object') {
			Object.keys(computed).forEach(key => {
				Object.defineProperty(_this, key, {
					get: typeof computed[key] === 'function' ?
						computed[key] : computed[key].get,
					set() {},
				})
			})
		}
	}
}