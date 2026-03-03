// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（7天保护期）
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @version      2.1.4
// @description  严格区分删除与下架，精准点击红色 Konfirmasi 确认按钮
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
        backgroundColor: 'rgba(0, 0, 0, 0.9)', color: '#fff',
        borderRadius: '8px', fontSize: '13px', width: '280px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)', border: '1px solid #444'
    });

    panel.innerHTML = `
        <div style="margin-bottom:10px;font-weight:bold;color:#FF5252;font-size:14px;border-bottom:1px solid #555;padding-bottom:5px;">
            💀 精准清理 (死刑判决)
        </div>
        
        <div style="background:#333;padding:5px;border-radius:4px;margin-bottom:10px;">
            <div style="color:#4caf50;font-weight:bold;margin-bottom:3px;">🛡️ 逻辑说明:</div>
            只有 <span style="color:#FF5252">上架>7天</span> <br>
            且 <span style="color:#FF5252">Views <= 设定值</span> <br>
            才会选中删除！缺一不可！
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;">
            <label>Views 小于等于:</label>
            <input type="number" id="tk_view_threshold" value="0" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;font-weight:bold;color:red;">
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;">
            <label>单次最大删除数:</label>
            <input type="number" id="tk_max_del" value="100" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;">
        </div>

        <button id="tk_start_btn" style="width:100%;padding:8px;background:#D32F2F;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px;">
            开始执行
        </button>
    `;
    document.body.appendChild(panel);

    // 日志窗口
    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '320px', bottom: '20px',
        width: '400px', maxHeight: '300px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.85)',
        color: '#eee', padding: '10px',
        fontSize: '12px', borderRadius: '4px', zIndex: 9999,
        fontFamily: 'monospace'
    });
    document.body.appendChild(logDiv);

    function log(text, color = 'white') {
        const line = document.createElement('div');
        line.innerHTML = `<span style="color:#888">[${new Date().toLocaleTimeString()}]</span> <span style="color:${color}">${text}</span>`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    // ====== 2. 核心函数 ======

    // 提取数字 (核心修复：增强正则匹配)
    function parseNum(str) {
        if (!str) return 0;
        if (str.toUpperCase().includes('N/A')) return 0;
        // 移除逗号，转小写
        let val = str.replace(/,/g, '').toLowerCase();
        // 处理 k/m 单位
        if (val.includes('k')) return parseFloat(val) * 1000;
        if (val.includes('m')) return parseFloat(val) * 1000000;
        // 提取纯数字
        let match = val.match(/[\d.]+/);
        return match ? parseFloat(match[0]) : 0;
    }

    // 判断是否老品 (>7天)
    function isOldProduct(dateStr) {
        if (!dateStr) return false;
        // 格式: 09/02/2026 15:36
        const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return false;

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; 
        const year = parseInt(match[3], 10);

        const productDate = new Date(year, month, day);
        const now = new Date();
        const diffTime = now - productDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        return diffDays > 7;
    }

    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    // ====== 3. 主逻辑 ======
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        const VIEW_LIMIT = parseInt(document.getElementById('tk_view_threshold').value); // 默认0
        const MAX_DELETE = parseInt(document.getElementById('tk_max_del').value) || 100;
        const MAX_PAGES = 50;

        log(`🚀 任务开始! 删除标准: 上架>7天 AND Views <= ${VIEW_LIMIT}`, '#4caf50');

        let totalDeleted = 0;
        let isStopped = false;

        for(let page = 1; page <= MAX_PAGES; page++){
            if(isStopped) break;
            log(`--- 正在扫描第 ${page} 页 ---`, '#aaa');

            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){
                log('⚠️ 未找到商品行，等待或已到底', 'orange');
                break;
            }

            let pageDeleteCount = 0;

            for(let i=0; i < rows.length; i++){
                if(totalDeleted >= MAX_DELETE) {
                    isStopped = true;
                    log(`🛑 已达上限 ${MAX_DELETE} 个`, 'red');
                    break;
                }

                const row = rows[i];
                const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                if(checkbox && checkbox.checked) continue; // 已勾选跳过

                // --- 1. 获取时间 (提取你的class) ---
                const timeElements = row.querySelectorAll('.text-body-s-regular.text-neutral-text3');
                let dateStr = "";
                for(let el of timeElements) {
                    if(el.innerText.includes('/') && el.innerText.includes(':')) {
                        dateStr = el.innerText.trim();
                        break;
                    }
                }

                // --- 2. 获取 Views (增强正则) ---
                // 尝试多种匹配方式，防止漏抓
                let rowText = row.innerText;
                let viewsMatch = rowText.match(/Views[:\s]*([\d.,kK]+)/i) || 
                                 rowText.match(/Tayangan[:\s]*([\d.,kK]+)/i) ||
                                 rowText.match(/([\d.,kK]+)\s*Views/i);
                
                let viewsStr = viewsMatch ? viewsMatch[1] : 'N/A';
                let viewsVal = parseNum(viewsStr);

                // --- 3. 严格判定 (AND) ---
                const isOld = isOldProduct(dateStr);
                const isLowTraffic = viewsVal <= VIEW_LIMIT;

                // 调试日志 (帮你通过日志看看到底怎么判的)
                // log(`分析: 时间[${dateStr}] Views[${viewsVal}]`, '#666');

                if (isOld) {
                    // 是老品，进入第二轮面试
                    if (isLowTraffic) {
                        // 面试通过：既老又没流量 -> 删
                        if(checkbox && !checkbox.checked){
                            checkbox.click();
                            pageDeleteCount++;
                            totalDeleted++;
                            log(`✅ [勾选] 时间:${dateStr} (>7天) | Views:${viewsVal} (<= ${VIEW_LIMIT})`, '#66ff66');
                        }
                    } else {
                        // 面试失败：是老品，但流量不错 -> 留
                        // log(`🛡️ [保留] 老爆款: Views ${viewsVal} > ${VIEW_LIMIT}`, '#ffa500');
                    }
                } else {
                    // 新品 -> 留
                    // log(`🛡️ [保留] 新品: ${dateStr}`, '#2196f3');
                }
            }

            // --- 执行删除 ---
            if(pageDeleteCount > 0){
                log(`🔥 本页选中 ${pageDeleteCount} 个，3秒后删除...`, 'yellow');
                await new Promise(r=>setTimeout(r, 3000));

                // 批量按钮
                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn) { dropdownBtn.click(); await new Promise(r=>setTimeout(r, 800)); }

                // Delete 选项
                const menuItems = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item, div.core-dropdown-menu-item'));
                const deleteItem = menuItems.find(el => {
                    const txt = el.textContent.trim();
                    return (txt.includes('Delete') && !txt.includes('Deactivate')) || txt === '删除' || txt === 'Hapus';
                });
                if(deleteItem) { deleteItem.click(); await new Promise(r=>setTimeout(r, 1500)); }

                // 弹窗确认
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                modalCheckboxes.forEach(cb => { if(!cb.checked) cb.click(); });
                await new Promise(r=>setTimeout(r, 500));

                // 红色按钮
                let confirmBtn = getElementByXpath("/html/body/div[10]/div[2]/div/div[3]/div/button[2]") ||
                                 document.querySelector('button.core-btn-status-danger');
                if(confirmBtn){
                    if(confirmBtn.disabled) await new Promise(r=>setTimeout(r, 500));
                    confirmBtn.click();
                    log(`🗑️ 已执行删除动作`, 'red');
                    await new Promise(r=>setTimeout(r, 5000));
                }
            } else {
                log('👀 本页没有要删的', '#aaa');
            }

            if(totalDeleted >= MAX_DELETE) break;

            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                nextBtn.click();
                log('📄 翻页...', 'cyan');
                await new Promise(r=>setTimeout(r, 8000));
            } else {
                log('🏁 结束', '#4caf50');
                break;
            }
        }
        log(`🎉 任务完成! 共删 ${totalDeleted} 个`, '#4caf50');
    });
})();
