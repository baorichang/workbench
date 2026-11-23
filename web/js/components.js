/* 通用组件：模态表单、确认框、toast、空状态、状态标签、HTML 转义 */
const Components = {
  STATUS_COLORS: {
    "构思中": "gray", "撰写中": "blue", "待发布": "orange", "已发布": "green",
    "进行中": "blue", "搁置": "gray", "已完成": "green",
    "待联系": "orange", "沟通中": "blue", "待回复": "orange", "已结束": "gray",
    "待玩": "gray", "在玩": "blue", "已通关": "green", "弃坑": "gray",
    "高": "red", "中": "orange", "低": "gray"
  },

  escape(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  },

  toast(message, type = "info") {
    let box = document.querySelector(".toast-box");
    if (!box) {
      box = document.createElement("div");
      box.className = "toast-box";
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.className = `toast toast-${type}`;
    el.textContent = message;
    box.appendChild(el);
    setTimeout(() => { el.classList.add("toast-hide"); }, 2200);
    setTimeout(() => { el.remove(); }, 2600);
  },

  confirm({ title = "确认操作", message = "", danger = false }) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "modal-mask";
      mask.innerHTML = `
        <div class="modal">
          <div class="modal-title">${this.escape(title)}</div>
          <div class="modal-body">${this.escape(message)}</div>
          <div class="modal-actions">
            <button class="btn" data-act="cancel">取消</button>
            <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-act="ok">确认</button>
          </div>
        </div>`;
      document.body.appendChild(mask);
      const close = (result) => { mask.remove(); resolve(result); };
      mask.querySelector('[data-act="cancel"]').onclick = () => close(false);
      mask.querySelector('[data-act="ok"]').onclick = () => close(true);
      mask.onclick = (e) => { if (e.target === mask) close(false); };
    });
  },

  /**
   * 打开模态表单。fields: [{key,label,type,options,required,placeholder}]
   * resolve: 提交为 {values}，取消为 null
   */
  openForm({ title, fields, initial = {}, submitText = "保存" }) {
    return new Promise((resolve) => {
      const mask = document.createElement("div");
      mask.className = "modal-mask";

      const renderField = (f) => {
        const value = initial[f.key] ?? "";
        const req = f.required ? "required" : "";
        let input = "";
        if (f.type === "textarea") {
          input = `<textarea name="${f.key}" rows="3" ${req} placeholder="${this.escape(f.placeholder || "")}">${this.escape(value)}</textarea>`;
        } else if (f.type === "select") {
          const opts = (f.options || []).map((o) => {
            const v = typeof o === "object" ? o.value : o;
            const label = typeof o === "object" ? o.label : o;
            const sel = String(value) === String(v) ? "selected" : "";
            return `<option value="${this.escape(v)}" ${sel}>${this.escape(label)}</option>`;
          }).join("");
          input = `<select name="${f.key}" ${req}>${opts}</select>`;
        } else if (f.type === "checkbox") {
          const checked = value ? "checked" : "";
          input = `<input type="checkbox" name="${f.key}" ${checked}>`;
        } else {
          input = `<input type="${f.type || "text"}" name="${f.key}" value="${this.escape(value)}" ${req} placeholder="${this.escape(f.placeholder || "")}">`;
        }
        return `<label class="form-field">
          <span class="form-label">${this.escape(f.label)}${f.required ? " *" : ""}</span>
          ${input}
          <span class="form-error" data-error="${f.key}"></span>
        </label>`;
      };

      mask.innerHTML = `
        <div class="modal">
          <div class="modal-title">${this.escape(title)}</div>
          <div class="modal-body form-body">${fields.map(renderField).join("")}</div>
          <div class="modal-actions">
            <button class="btn" data-act="cancel">取消</button>
            <button class="btn btn-primary" data-act="ok">${this.escape(submitText)}</button>
          </div>
        </div>`;
      document.body.appendChild(mask);

      const close = (result) => { mask.remove(); resolve(result); };

      mask.querySelector('[data-act="cancel"]').onclick = () => close(null);
      mask.onclick = (e) => { if (e.target === mask) close(null); };

      mask.querySelector('[data-act="ok"]').onclick = () => {
        const values = {};
        let valid = true;
        fields.forEach((f) => {
          const el = mask.querySelector(`[name="${f.key}"]`);
          let v;
          if (f.type === "checkbox") v = el.checked;
          else v = el.value.trim();
          values[f.key] = v;
          const errEl = mask.querySelector(`[data-error="${f.key}"]`);
          if (f.required && (v === "" || v === false)) {
            errEl.textContent = "此项为必填";
            valid = false;
          } else {
            errEl.textContent = "";
          }
        });
        if (valid) close({ values });
      };
    });
  },

  emptyState(text, actionLabel, onAction) {
    const wrap = document.createElement("div");
    wrap.className = "empty-state";
    wrap.innerHTML = `<div class="empty-text">${this.escape(text)}</div>`;
    if (actionLabel) {
      const btn = document.createElement("button");
      btn.className = "btn btn-primary";
      btn.textContent = actionLabel;
      btn.onclick = onAction;
      wrap.appendChild(btn);
    }
    return wrap;
  },

  statusLabel(status) {
    if (!status) return "";
    const color = this.STATUS_COLORS[status] || "gray";
    return `<span class="tag tag-${color}">${this.escape(status)}</span>`;
  }
};
