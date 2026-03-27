// ==UserScript==
// @name         TikTok 小店 批量下架助手 (4.5.0 终极稳定版)
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_deactive.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_deactive.user.js
// @version      4.5.0
// @description  逻辑：(Live + Reviewing) > 99 时下架。集成了证明有效的 data-uid 强制点击逻辑。
// @author       TOM
// @match        https://seller-id.tokopedia.com/product/manage*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ====== 1. UI 面板 ======
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed', left: '20px', bottom: '20px',
        zIndex: 9999, padding: '15px',
        backgroundColor: 'rgba(26, 26, 26, 0.98)', color: '#fff',
        borderRadius: '8px', fontSize: '13px', width: '280px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)', border: '2px solid #448AFF'
    });

    panel.innerHTML = `
        <div style="margin-bottom:10px;font-weight:bold;color:#448AFF;font-size:14px;border-bottom:1px solid #444;padding-bottom:5px;">📦 批量下架助手 (L+R 总额版)</div>
        <div style="background:#222;padding:8px;border-radius:4px;margin-bottom:10px;font-size:12px;line-height:1.6;">
            <div id="tk_count_status" style="color:#aaa;">Live: - | Reviewing: -</div>
            <div id="tk_total_status" style="color:#4caf50;font-weight:bold;">当前活跃总数: -</div>
            <div id="tk_quota_status" style="color:#ff9800;font-weight:bold;">计算额度中...</div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;">
            <label>Views 小于等于:</label>
            <input type="number" id="tk_view_threshold" value="0" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;font-weight:bold;color:blue;">
        </div>
        <button id="tk_start_btn" style="width:100%;padding:10px;background:#448AFF;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">开始扫描下架</button>
    `;
    document.body.appendChild(panel);

    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '320px', bottom: '20px', width: '380px', maxHeight: '250px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.9)', color: '#eee', padding: '10px',
        fontSize: '12px', borderRadius: '4px', zIndex: 9999, border: '1px solid #444'
    });
    document.body.appendChild(logDiv);

    function log(text, color = 'white') {
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:#888">[${new Date().toLocaleTimeString()}]</span> <span style="color:${color}">${text}</span>`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    // ====== 2. 核心：证明有效的暴力点击函数 (方案 A) ======
    function forceClickConfirm(el) {
        if (!el) return;
        // 1. 强行解禁
        el.removeAttribute('disabled');
        el.disabled = false;
        el.classList.remove('core-btn-disabled', 'pulse-button-disabled');
        
        // 2. 模拟真实点击序列
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    // ====== 3. 统计逻辑 (加总 Live + Reviewing) ======
    function getStats() {
        const spans = document.querySelectorAll('span.font-regular.text-neutral-text3');
        let live = 0, rev = 0;
        spans.forEach(s => {
            const txt = s.parentElement ? s.parentElement.innerText : "";
            if (txt.includes('Live') || txt.includes('在线')) live = parseInt(s.innerText) || 0;
            if (txt.includes('Reviewing') || txt.includes('审核中')) rev = parseInt(s.innerText) || 0;
        });
        return { live, rev, total: (live + rev) };
    }

    // ====== 4. 弹窗处理 (核心：集成方案 A) ======
    async function handlePlatformModal() {
        log('检测到弹窗，正在勾选平台...', '#FFEB3B');
        
        // 1. 勾选双平台 (mask.click)
        const platforms = ["TikTok Shop", "Tokopedia"];
        for (let pName of platforms) {
            const labels = Array.from(document.querySelectorAll('label.core-checkbox'));
            const label = labels.find(el => el.innerText.includes(pName));
            if (label) {
                const mask = label.querySelector('.core-checkbox-mask');
                if (mask) {
                    mask.click();
                    log(`勾选平台: ${pName}`, 'cyan');
                    await new Promise(r => setTimeout(r, 1200)); // 给网页反应时间
                }
            }
        }

        // 2. 确认下架 (使用证明有效的 data-uid 精准定位)
        log('正在执行暴力确认点击...', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
        
        const confirmBtn = document.querySelector('button[data-uid*="onconfirm"]');
        if (confirmBtn) {
            forceClickConfirm(confirmBtn);
            log('✅ 确认下架指令已发送', '#4caf50');
            return true;
        } else {
            // 备选方案：通过文本寻找
            const altBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Confirm'));
            if (altBtn) {
                forceClickConfirm(altBtn);
                log('✅ 确认下架指令已发送 (备选路径)', '#4caf50');
                return true;
            }
        }
        log('❌ 未能定位确认按钮', 'red');
        return false;
    }

    function parseNum(str) {
        if (!str || str.includes('N/A')) return 0;
        let v = str.replace(/,/g, '').toLowerCase();
        if (v.includes('k')) return parseFloat(v) * 1000;
        if (v.includes('m')) return parseFloat(v) * 1000000;
        let m = v.match(/[\d.]+/);
        return m ? parseFloat(m[0]) : 0;
    }

    // ====== 5. 实时监控 ======
    setInterval(() => {
        const s = getStats();
        const q = s.total - 99;
        const countEl = document.getElementById('tk_count_status');
        const totalEl = document.getElementById('tk_total_status');
        const quotaEl = document.getElementById('tk_quota_status');
        if (countEl) countEl.innerText = `Live: ${s.live} | Reviewing: ${s.rev}`;
        if (totalEl) totalEl.innerText = `总活跃 (L+R): ${s.total}`;
        if (quotaEl) quotaEl.innerText = q > 0 ? `待处理名额: ${q}` : `无需下架 (保留99)`;
    }, 2000);

    // ====== 6. 主执行流程 ======
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        const stats = getStats();
        const limit = parseInt(document.getElementById('tk_view_threshold').value) || 0;
        let maxDel = stats.total - 99;

        if (maxDel <= 0) {
            log(`当前活跃商品 ${stats.total} 未超过 99，无需操作`, 'orange');
            return;
        }

        log(`🚀 启动任务 | 总量:${stats.total} | 目标数:${maxDel}`, '#4caf50');
        let done = 0;

        for (let p = 1; p <= 50; p++) {
            if (done >= maxDel) break;
            
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            let pageSelected = 0;

            for (let row of rows) {
                if (done >= maxDel) break;
                
                const cbLabel = row.querySelector('label.core-checkbox');
                if (!cbLabel) continue;
                const cbInput = cbLabel.querySelector('input');
                if (cbInput && cbInput.checked) continue;

                // 提取 Views
                const rowText = row.innerText;
                const vMatch = rowText.match(/Views[:\s]*([\d.,kK]+)/i) || rowText.match(/([\d.,kK]+)\s*Views/i) || rowText.match(/Tayangan[:\s]*([\d.,kK]+)/i);
                const views = vMatch ? parseNum(vMatch[1]) : 0;

                if (views <= limit) {
                    // 使用 PointerEvent 模拟点击商品列表复选框
                    const opts = { bubbles: true, cancelable: true, view: window };
                    cbLabel.dispatchEvent(new MouseEvent('click', opts));
                    pageSelected++;
                    done++;
                    log(`[${done}/${maxDel}] 选中商品: Views=${views}`, '#66ff66');
                    await new Promise(r => setTimeout(r, 150));
                }
            }

            if (pageSelected > 0) {
                log('打开批量菜单并选择下架...', 'yellow');
                const bulkBtn = document.querySelector(".pulse-bulk-action-dropdown button");
                if (bulkBtn) {
                    bulkBtn.click();
                    await new Promise(r => setTimeout(r, 1200));
                    
                    const menu = Array.from(document.querySelectorAll('.core-dropdown-menu-item, .pulse-dropdown-menu-item'));
                    const decBtn = menu.find(m => m.innerText.includes('Deactivate') || m.innerText.includes('下架'));
                    
                    if (decBtn) {
                        decBtn.click();
                        await new Promise(r => setTimeout(r, 2000));
                        // 🚀 处理弹窗
                        await handlePlatformModal(); 
                        await new Promise(r => setTimeout(r, 7000)); // 等待数据刷新
                    }
                }
            }

            // 翻页
            const next = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if (next && done < maxDel) {
                next.click();
                log('📄 翻页中...', 'cyan');
                await new Promise(r => setTimeout(r, 6000));
            } else {
                break;
            }
        }
        log('🏁 批量下架任务执行完毕', '#4caf50');
    });

})();
