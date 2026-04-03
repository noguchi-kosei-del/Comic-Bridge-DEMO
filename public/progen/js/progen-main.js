// progen-main.js
// ES Module エントリーポイント - 全モジュールを読み込む

// グローバル通知ダイアログ（<dialog> 要素ベース）
function showToast(message, type) {
    const dialog = document.getElementById('globalAlertDialog');
    const icon = document.getElementById('globalAlertIcon');
    const msg = document.getElementById('globalAlertMsg');
    if (!dialog) return Promise.resolve();

    const t = type || 'success';
    const icons = {
        success: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--sage)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        error:   '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--warm-red)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
        warning: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#b47628" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    const bgColors = { success: '#edf7f1', error: '#fceeed', warning: '#fdf6ec' };
    icon.innerHTML = icons[t] || icons.success;
    icon.style.background = bgColors[t] || bgColors.success;
    msg.textContent = message;

    if (dialog.open) dialog.close();
    dialog.showModal();

    return new Promise(resolve => {
        dialog.addEventListener('close', resolve, { once: true });
    });
}
window.showToast = showToast;

import './progen-state.js';
import './progen-xml-templates.js';
import './progen-data.js';
import './progen-landing.js';
import './progen-extraction.js';
import './progen-xml-gen.js';
import './progen-check-simple.js';
import './progen-check-variation.js';
import './progen-proofreading.js';
import './progen-json-browser.js';
import './progen-admin.js';
import './progen-note-txt.js';
import './progen-result-viewer.js';
import './progen-comicpot.js';
import './progen-viewer.js';

// 全モジュール読み込み後に起動時の初期化を実行
window.init();
window.initJsonFolderBrowser();
window.initCalibrationFolderBrowser();

// ドロップゾーンの初期化（COMIC-Bridge統合版: テキストD&Dは親アプリで管理）
const proofreadingTxtDropZone = document.getElementById('proofreadingTxtDropZone');
if (proofreadingTxtDropZone) window.setupDropZone(proofreadingTxtDropZone, window.addProofreadingTxt);

// ═══ COMIC-Bridge統合: localStorageポーリングでコマンド受信 ═══
// React側が localStorage.setItem('cb_progen_cmd', JSON.stringify({mode, ts, ...})) で書き込み
// こちらが500msポーリングで検知し、モード遷移+テキスト注入+レーベル設定を行う
// iframeはstate-preserving（リロードなし）
(function () {
    var lastTs = 0;

    function processCommand(cmd) {
        if (!cmd || !cmd.mode) return;
        console.log('[ProGen] Command received:', cmd.mode, { text: !!cmd.textContent, json: !!cmd.jsonPath, label: cmd.labelName });

        var mode = cmd.mode;
        var landing = document.getElementById('landingScreen');
        var main = document.getElementById('mainWrapper');
        var proofreading = document.getElementById('proofreadingPage');

        // 全画面非表示
        if (landing) landing.style.display = 'none';
        if (main) main.style.display = 'none';
        if (proofreading) proofreading.style.display = 'none';

        // テキスト注入
        if (cmd.textContent && window.state) {
            var fileObj = { name: cmd.textFileName || 'text.txt', content: cmd.textContent, size: cmd.textContent.length };
            window.state.manuscriptTxtFiles = [fileObj];
            window.state.txtGuideDismissed = true;
            window.state.proofreadingFiles = [fileObj];
            window.state.proofreadingContent = cmd.textContent;
        }

        // レーベル設定
        if (cmd.labelName) {
            try {
                var displayGroup = document.getElementById('labelDisplayGroup');
                var displayText = document.getElementById('labelDisplayText');
                var selectorGroup = document.getElementById('labelSelectorGroup');
                if (displayGroup && displayText) {
                    if (selectorGroup) selectorGroup.style.display = 'none';
                    displayGroup.style.display = 'flex';
                    displayText.textContent = cmd.labelName;
                }
                var proofSelectorText = document.getElementById('proofreadingLabelSelectorText');
                if (proofSelectorText) {
                    proofSelectorText.textContent = cmd.labelName;
                    proofSelectorText.classList.remove('unselected');
                }
                var proofSelector = document.getElementById('proofreadingLabelSelect');
                if (proofSelector) {
                    var opts = proofSelector.querySelectorAll('option');
                    for (var i = 0; i < opts.length; i++) {
                        if (opts[i].value === cmd.labelName || opts[i].textContent === cmd.labelName) {
                            proofSelector.value = opts[i].value;
                            if (window.loadLabelRulesForProofreading) window.loadLabelRulesForProofreading(opts[i].value);
                            break;
                        }
                    }
                }
            } catch (e) { /* ignore */ }
        }

        // モード遷移
        function showMode() {
            // テキスト再注入（processLoadedJsonが上書きした分を修復）
            if (cmd.textContent && window.state) {
                var fo = { name: cmd.textFileName || 'text.txt', content: cmd.textContent, size: cmd.textContent.length };
                window.state.manuscriptTxtFiles = [fo];
                window.state.proofreadingFiles = [fo];
                window.state.proofreadingContent = cmd.textContent;
            }

            // 画面を確実に設定
            if (landing) landing.style.display = 'none';
            if (mode === 'proofreading') {
                if (main) main.style.display = 'none';
                if (proofreading) proofreading.style.display = 'flex';
                if (window.state) {
                    window.state.currentProofreadingMode = 'simple';
                    window.state.proofreadingReturnTo = 'landing';
                }
                document.querySelectorAll('.proofreading-mode-btn').forEach(function(btn) {
                    btn.classList.toggle('active', btn.dataset.mode === 'simple');
                });
                if (window.updateProofreadingCheckItems) window.updateProofreadingCheckItems();
                if (window.updateProofreadingOptionsLabel) window.updateProofreadingOptionsLabel();
                if (window.renderProofreadingFileList) window.renderProofreadingFileList();
                if (window.updateProofreadingPrompt) window.updateProofreadingPrompt();
                // 常用外漢字検出
                setTimeout(function () {
                    try {
                        if (window.state && window.state.proofreadingFiles && window.state.proofreadingFiles.length > 0
                            && window.detectNonJoyoLinesWithPageInfo && window.showNonJoyoResultPopup) {
                            var d = window.detectNonJoyoLinesWithPageInfo(window.state.proofreadingFiles);
                            window.state.proofreadingDetectedNonJoyoWords = d;
                            window.showNonJoyoResultPopup(d, true);
                        }
                    } catch (e) { /* ignore */ }
                }, 200);
            } else {
                if (proofreading) proofreading.style.display = 'none';
                if (main) main.style.display = 'flex';
                if (window.state) window.state.currentViewMode = 'edit';
                if (mode === 'formatting' && window.selectDataType) window.selectDataType('txt_only');
                if (window.updateTxtUploadStatus) window.updateTxtUploadStatus();
                if (window.renderTable) window.renderTable();
                if (window.showEditMode) window.showEditMode();
                if (window.renderSymbolTable) window.renderSymbolTable();
                if (window.generateXML) window.generateXML();
            }
            var geminiBtn = document.getElementById('extractionGeminiBtn');
            if (geminiBtn) geminiBtn.removeAttribute('disabled');
            if (window.enableDataTypeToggle) window.enableDataTypeToggle();
        }

        // JSON読み込み → showMode
        if (cmd.jsonPath && window.electronAPI && window.electronAPI.readJsonFile) {
            window.electronAPI.readJsonFile(cmd.jsonPath).then(function (result) {
                if (result && result.success !== false && window.processLoadedJson) {
                    var fn = cmd.jsonPath.split('\\').pop() || cmd.jsonPath.split('/').pop() || '';
                    window.processLoadedJson(result, fn).then(function () {
                        showMode();
                    }).catch(function () { showMode(); });
                } else { showMode(); }
            }).catch(function () { showMode(); });
        } else {
            showMode();
        }
    }

    // 500msポーリング
    setInterval(function () {
        try {
            var raw = localStorage.getItem('cb_progen_cmd');
            if (!raw) return;
            var cmd = JSON.parse(raw);
            if (!cmd || !cmd.ts || cmd.ts <= lastTs) return;
            lastTs = cmd.ts;
            // コマンド消費
            localStorage.removeItem('cb_progen_cmd');
            processCommand(cmd);
        } catch (e) { /* ignore */ }
    }, 500);

    // 初回チェック（起動直後にコマンドがある場合）
    try {
        var raw = localStorage.getItem('cb_progen_cmd');
        if (raw) {
            var cmd = JSON.parse(raw);
            if (cmd && cmd.ts) {
                lastTs = cmd.ts;
                localStorage.removeItem('cb_progen_cmd');
                // モジュール初期化が完了するまで少し待つ
                setTimeout(function () { processCommand(cmd); }, 100);
            }
        }
    } catch (e) { /* ignore */ }
})();
