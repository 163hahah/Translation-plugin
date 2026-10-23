(function () {
    const vscode = acquireVsCodeApi();

    const LANGS = {
        'zh-CHS': '中文（简体）',
        'zh-CHT': '中文（繁体）',
        en: '英语',
        ja: '日语',
        ko: '韩语',
        fr: '法语',
        de: '德语',
        ru: '俄语',
        es: '西班牙语',
    };
    const DEBOUNCE_MS = 600;

    const $ = id => document.getElementById(id);
    const providerSel = $('provider');
    const fromSel = $('from');
    const toSel = $('to');
    const input = $('input');
    const output = $('output');
    const detected = $('detected');
    const details = $('details');
    const count = $('count');
    const status = $('status');
    const history = $('history');
    const historyList = $('historyList');

    function addOptions(select, autoLabel) {
        select.add(new Option(autoLabel, 'auto'));
        for (const [code, name] of Object.entries(LANGS)) {
            select.add(new Option(name, code));
        }
    }
    addOptions(fromSel, '检测语言');
    addOptions(toSel, '自动');

    const saved = vscode.getState() || {};
    fromSel.value = saved.from || 'auto';
    toSel.value = saved.to || 'auto';
    input.value = saved.text || '';

    let seq = 0;
    let latestId = 0;
    let timer;
    const pending = new Map();
    /** 最近一次成功的翻译：{ text, translation, from, to, recorded } */
    let last = null;

    function saveState() {
        vscode.setState({ from: fromSel.value, to: toSel.value, text: input.value });
    }

    function updateCount() {
        count.textContent = String(input.value.length);
    }

    function clearResult() {
        last = null;
        output.textContent = '';
        output.className = 'output';
        detected.textContent = '';
        details.textContent = '';
        status.textContent = '';
    }

    function translate(record) {
        clearTimeout(timer);
        saveState();
        const text = input.value.trim();
        if (!text) {
            latestId = ++seq;
            clearResult();
            return;
        }
        latestId = ++seq;
        pending.set(latestId, { text, record });
        output.classList.add('loading');
        status.textContent = '翻译中…';
        vscode.postMessage({
            type: 'translate',
            id: latestId,
            text,
            from: fromSel.value,
            to: toSel.value,
            provider: providerSel.value,
            record,
        });
    }

    function scheduleTranslate() {
        clearTimeout(timer);
        timer = setTimeout(() => translate(false), DEBOUNCE_MS);
    }

    /** 把已经翻译好但还没记入历史的内容记一笔（用于边输入边翻译的场景） */
    function recordLast() {
        if (last && !last.recorded && last.text === input.value.trim()) {
            last.recorded = true;
            vscode.postMessage({ type: 'record', text: last.text, translation: last.translation });
        }
    }

    function appendList(title, lines) {
        const h = document.createElement('h4');
        h.textContent = title;
        const ul = document.createElement('ul');
        for (const line of lines) {
            const li = document.createElement('li');
            li.textContent = line;
            ul.appendChild(li);
        }
        details.append(h, ul);
    }

    function renderResult(req, result) {
        const translation = result.translation.join('\n');
        const { from, to } = result;
        last = { text: req.text, translation, from, to, recorded: req.record };

        output.className = 'output';
        output.textContent = translation;
        status.textContent = '';
        detected.textContent =
            fromSel.value === 'auto' && LANGS[from] ? `检测为：${LANGS[from]} → ${LANGS[to] || to}` : '';

        details.textContent = '';
        const { uk, us, general } = result.phonetic || {};
        const phonetic = uk || us ? `${uk ? `英 [${uk}]` : ''}  ${us ? `美 [${us}]` : ''}` : general ? `[${general}]` : '';
        if (phonetic) {
            const div = document.createElement('div');
            div.className = 'phonetic';
            div.textContent = phonetic.trim();
            details.appendChild(div);
        }
        if (result.explains && result.explains.length) {
            appendList('释义', result.explains);
        }
        if (result.web && result.web.length) {
            appendList('网络释义', result.web.slice(0, 5).map(item => `${item.key}：${item.value.join('；')}`));
        }
    }

    function renderError(message, needsConfig) {
        last = null;
        output.className = 'output error';
        output.textContent = message;
        status.textContent = '';
        detected.textContent = '';
        details.textContent = '';
        if (needsConfig) {
            const btn = document.createElement('button');
            btn.className = 'link';
            btn.textContent = '打开设置填写应用 ID 和密钥';
            btn.addEventListener('click', () => vscode.postMessage({ type: 'openSettings' }));
            output.appendChild(btn);
        }
    }

    function renderHistory(items) {
        historyList.textContent = '';
        if (!items.length) {
            const li = document.createElement('li');
            li.className = 'empty';
            li.textContent = '暂无记录';
            historyList.appendChild(li);
            return;
        }
        for (const item of items) {
            const li = document.createElement('li');
            li.title = `${item.text}\n→ ${item.translation}`;
            li.textContent = item.text;
            const hint = document.createElement('span');
            hint.className = 'hint';
            hint.textContent = item.translation;
            li.appendChild(hint);
            li.addEventListener('click', () => {
                input.value = item.text;
                updateCount();
                history.hidden = true;
                translate(false);
            });
            historyList.appendChild(li);
        }
    }

    input.addEventListener('input', () => {
        updateCount();
        scheduleTranslate();
    });
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            translate(true);
        }
    });
    input.addEventListener('blur', recordLast);

    providerSel.addEventListener('change', () => {
        vscode.postMessage({ type: 'setProvider', provider: providerSel.value });
        translate(false);
    });
    fromSel.addEventListener('change', () => translate(false));
    toSel.addEventListener('change', () => translate(false));

    $('swap').addEventListener('click', () => {
        const from = fromSel.value === 'auto' ? (last && last.from) || 'auto' : fromSel.value;
        const to = toSel.value === 'auto' ? (last && last.to) || 'auto' : toSel.value;
        fromSel.value = LANGS[to] ? to : 'auto';
        toSel.value = LANGS[from] ? from : 'auto';
        if (last) {
            input.value = last.translation;
            updateCount();
        }
        translate(true);
    });

    $('clear').addEventListener('click', () => {
        recordLast();
        input.value = '';
        updateCount();
        translate(false);
        input.focus();
    });

    $('copy').addEventListener('click', () => {
        if (last) {
            recordLast();
            vscode.postMessage({ type: 'copy', text: last.translation });
        }
    });

    $('toggleHistory').addEventListener('click', () => {
        history.hidden = !history.hidden;
    });

    $('clearHistory').addEventListener('click', () => vscode.postMessage({ type: 'clearHistory' }));

    window.addEventListener('message', event => {
        const msg = event.data;
        switch (msg.type) {
            case 'providers': {
                const first = !providerSel.options.length;
                if (first) {
                    for (const item of msg.items) {
                        providerSel.add(new Option(item.name, item.id));
                    }
                }
                providerSel.value = msg.value;
                // 渠道列表到达后才能发起请求，恢复上次输入的内容并翻译
                if (first && input.value.trim()) {
                    translate(false);
                }
                break;
            }
            case 'provider':
                if (providerSel.value !== msg.value) {
                    providerSel.value = msg.value;
                    translate(false);
                }
                break;
            case 'fill':
                if (msg.text === input.value.trim() && last) {
                    return;
                }
                input.value = msg.text;
                updateCount();
                history.hidden = true;
                translate(true);
                break;
            case 'result': {
                const req = pending.get(msg.id);
                pending.delete(msg.id);
                if (msg.id === latestId && req) {
                    renderResult(req, msg.result);
                }
                break;
            }
            case 'error':
                pending.delete(msg.id);
                if (msg.id === latestId) {
                    renderError(msg.message, msg.needsConfig);
                }
                break;
            case 'history':
                renderHistory(msg.items);
                break;
        }
    });

    updateCount();
    vscode.postMessage({ type: 'ready' });
})();
