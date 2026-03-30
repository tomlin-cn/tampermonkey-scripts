// ==UserScript==
// @name         TikTok 小店 批量下架助手 (4.6.0 印尼语适配版)
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_deactive.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_deactive.user.js
// @version      4.6.2
// @description  逻辑：(Live + Reviewing) > 99 时下架。新增：自动上架及二次弹窗 Submit 处理。
// @author       TOM
// @match        https://seller-id.tokopedia.com/product/manage*
// @match        https://seller-id.tokopedia.com/product/edit/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ====== 0. 自动更新/发布页面逻辑 (仅针对编辑页修改) ======
    if (window.location.href.includes('/product/edit/')) {
        console.log('[助手] 进入编辑页面，准备自动发布...');
        
        setTimeout(async () => {
            // 1. 查找并点击主页面的 Update/发布按钮
            const updateBtn = Array.from(document.querySelectorAll('button')).find(b =>
                b.innerText.includes('Update') ||
                b.innerText.includes('Publish') ||
                b.querySelector('.arco-icon-publish')
            );

            if (updateBtn) {
                updateBtn.click();
                console.log('✅ 已点击主页面 Update');

                // 2. 额外逻辑：等待 2 秒检测是否有二次确认弹窗 (Submit)
                setTimeout(() => {
                    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => 
                        (b.innerText.includes('Submit') || b.innerText.includes('Kirim')) && 
                        b.classList.contains('core-btn-primary')
                    );
                    if (submitBtn) {
                        submitBtn.click();
                        console.log('✅ 检测到二次弹窗，已点击 Submit');
                    }
                }, 4000);

                // 3. 5秒后关闭当前窗口
                setTimeout(() => {
                    console.log('关闭当前窗口');
                    window.close();
                }, 8000); 
            } else {
                console.log('❌ 未能找到 Update 按钮');
            }
        }, Math.floor(Math.random() * 3000) + 2000); // 2-5秒随机延迟
        return; 
    }

    // ====== 1. UI 面板 (其余代码严禁改动，保持原样) ======
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
            <div id="tk_count_status" style="color:#aaa;">L: - | R: -</div>
            <div id="tk_total_status" style="color:#4caf50;font-weight:bold;">当前活跃总数: -</div>
            <div id="tk_quota_status" style="color:#ff9800;font-weight:bold;">计算额度中...</div>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;">
            <label>Views 小于等于:</label>
            <input type="number" id="tk_view_threshold" value="0" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;font-weight:bold;color:blue;">
        </div>
        <button id="tk_start_btn" style="width:100%;padding:10px;background:#448AFF;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;margin-bottom:5px;">开始扫描下架</button>
        <button id="tk_auto_edit_btn" style="width:100%;padding:10px;background:#E91E63;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">自动上架 (批量编辑)</button>
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

    function forceClickConfirm(el) {
        if (!el) return;
        el.removeAttribute('disabled');
        el.disabled = false;
        el.classList.remove('core-btn-disabled', 'pulse-button-disabled');
        const opts = { bubbles: true, cancelable: true, view: window };
        el.dispatchEvent(new MouseEvent('mousedown', opts));
        el.dispatchEvent(new MouseEvent('mouseup', opts));
        el.dispatchEvent(new MouseEvent('click', opts));
    }

    function getStats() {
        const spans = document.querySelectorAll('span.font-regular.text-neutral-text3');
        let live = 0, rev = 0;
        spans.forEach(s => {
            const txt = s.parentElement ? s.parentElement.innerText : "";
            if (txt.includes('Live') || txt.includes('在线') || txt.includes('Aktif') || txt.includes('Active')) {
                live = parseInt(s.innerText) || 0;
            }
            if (txt.includes('Reviewing') || txt.includes('审核中') || txt.includes('Sedang ditinjau') || txt.includes('Ditinjau')) {
                rev = parseInt(s.innerText) || 0;
            }
        });
        return { live, rev, total: (live + rev) };
    }

    async function handlePlatformModal() {
        log('检测到弹窗，正在勾选平台...', '#FFEB3B');
        const platforms = ["TikTok Shop", "Tokopedia"];
        for (let pName of platforms) {
            const labels = Array.from(document.querySelectorAll('label.core-checkbox'));
            const label = labels.find(el => el.innerText.includes(pName));
            if (label) {
                const mask = label.querySelector('.core-checkbox-mask');
                if (mask) {
                    mask.click();
                    log(`勾选平台: ${pName}`, 'cyan');
                    await new Promise(r => setTimeout(r, 1200));
                }
            }
        }
        log('正在执行确认点击...', 'yellow');
        await new Promise(r => setTimeout(r, 1000));
        const confirmBtn = document.querySelector('button[data-uid*="onconfirm"]');
        if (confirmBtn) {
            forceClickConfirm(confirmBtn);
            log('✅ 确认下架指令已发送', '#4caf50');
            return true;
        } else {
            const altBtn = Array.from(document.querySelectorAll('button')).find(b =>
                b.innerText.includes('Confirm') || b.innerText.includes('确认') || b.innerText.includes('Konfirmasi')
            );
            if (altBtn) {
                forceClickConfirm(altBtn);
                log('✅ 确认下架指令已发送 (备选路径)', '#4caf50');
                return true;
            }
        }
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

    setInterval(() => {
        const s = getStats();
        const q = s.total - 99;
        const countEl = document.getElementById('tk_count_status');
        const totalEl = document.getElementById('tk_total_status');
        const quotaEl = document.getElementById('tk_quota_status');
        if (countEl) countEl.innerText = `L: ${s.live} | R: ${s.rev}`;
        if (totalEl) totalEl.innerText = `总活跃 (Aktif+Review): ${s.total}`;
        if (quotaEl) quotaEl.innerText = q > 0 ? `待处理名额: ${q}` : `无需下架 (保留99)`;
    }, 2000);

    // 批量下架主执行流程
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        const stats = getStats();
        const limit = parseInt(document.getElementById('tk_view_threshold').value) || 0;
        let maxDel = stats.total - 99;
        if (maxDel <= 0) {
            log(`当前活跃总数 ${stats.total} 未超过 99，无需操作`, 'orange');
            return;
        }
        log(`🚀 任务启动 | 总量:${stats.total} | 目标下架:${maxDel}`, '#4caf50');
        let done = 0;
        for (let p = 1; p <= 50; p++) {
            if (done >= maxDel) break;
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            let pageSelected = 0;
            for (let row of rows) {
                if (done >= maxDel) break;
                const cbLabel = row.querySelector('label.core-checkbox');
                if (!cbLabel) continue;
                const rowText = row.innerText;
                const vMatch = rowText.match(/Views[:\s]*([\d.,kK]+)/i) || rowText.match(/([\d.,kK]+)\s*Views/i) || rowText.match(/Tayangan[:\s]*([\d.,kK]+)/i);
                const views = vMatch ? parseNum(vMatch[1]) : 0;
                if (views <= limit) {
                    cbLabel.click();
                    pageSelected++;
                    done++;
                    log(`[${done}/${maxDel}] 选中商品: Views=${views}`, '#66ff66');
                    await new Promise(r => setTimeout(r, 150));
                }
            }
            if (pageSelected > 0) {
                const bulkBtn = document.querySelector(".pulse-bulk-action-dropdown button");
                if (bulkBtn) {
                    bulkBtn.click();
                    await new Promise(r => setTimeout(r, 1200));
                    const menu = Array.from(document.querySelectorAll('.core-dropdown-menu-item, .pulse-dropdown-menu-item'));
                    const decBtn = menu.find(m => m.innerText.includes('Deactivate') || m.innerText.includes('下架') || m.innerText.includes('Nonaktifkan'));
                    if (decBtn) {
                        decBtn.click();
                        await new Promise(r => setTimeout(r, 2000));
                        await handlePlatformModal();
                        await new Promise(r => setTimeout(r, 7000));
                    }
                }
            }
            const next = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if (next && done < maxDel) {
                next.click();
                await new Promise(r => setTimeout(r, 6000));
            } else break;
        }
        log('🏁 批量下架任务执行完毕', '#4caf50');
    });

    // 自动上架 (批量编辑) 执行流程
    document.getElementById('tk_auto_edit_btn').addEventListener('click', async () => {
        const targetCount = Math.floor(Math.random() * 21) + 20; 
        let currentDone = 0;
        log(`▶️ 自动上架启动 | 计划点击次数: ${targetCount}`, '#E91E63');
        while (currentDone < targetCount) {
            const editButtons = Array.from(document.querySelectorAll('button')).filter(btn =>
                btn.querySelector('.arco-icon-edit')
            );
            if (editButtons.length === 0) {
                log('当前页没有找到编辑按钮，尝试翻页...', 'yellow');
                const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
                if (nextBtn) {
                    nextBtn.click();
                    await new Promise(r => setTimeout(r, 5000)); 
                    continue;
                } else break;
            }
            for (let btn of editButtons) {
                if (currentDone >= targetCount) break;
                btn.scrollIntoView({ behavior: "smooth", block: "center" });
                await new Promise(r => setTimeout(r, 500));
                btn.click();
                currentDone++;
                log(`[${currentDone}/${targetCount}] 已点击编辑`, '#66ff66');
                const sleepTime = Math.floor(Math.random() * 10001) + 5000;
                log(`等待下一次点击: ${sleepTime / 1000}s...`, '#aaa');
                await new Promise(r => setTimeout(r, sleepTime));
            }
        }
        log('🏁 自动点击编辑任务完成', '#4caf50');
    });

})();
