// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（7天保护期）
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @version      2.1.2
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
        borderRadius: '8px', fontSize: '13px', width: '260px',
        boxShadow: '0 4px 15px rgba(0,0,0,0.5)', border: '1px solid #444'
    });

    panel.innerHTML = `
        <div style="margin-bottom:10px;font-weight:bold;color:#FF5252;font-size:14px;border-bottom:1px solid #555;padding-bottom:5px;">
            💀 僵尸链接清理器
        </div>
        
        <div style="background:#333;padding:5px;border-radius:4px;margin-bottom:10px;">
            <div style="color:#4caf50;font-weight:bold;margin-bottom:3px;">🛡️ 保护机制:</div>
            上架不足 <span style="color:#fff;font-weight:bold;">7</span> 天的新品，<br>
            <span style="color:#4caf50;">绝对不删</span>，直接跳过。
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:8px;align-items:center;">
            <label>只删 Views 低于:</label>
            <input type="number" id="tk_view_threshold" value="0" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;">
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:12px;align-items:center;">
            <label>单次最大删除数:</label>
            <input type="number" id="tk_max_del" value="100" style="width:60px;padding:3px;border-radius:4px;border:none;text-align:center;">
        </div>

        <button id="tk_start_btn" style="width:100%;padding:8px;background:#D32F2F;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;font-size:14px;">
            开始执行清理
        </button>
    `;
    document.body.appendChild(panel);

    // 日志窗口
    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '300px', bottom: '20px',
        width: '400px', maxHeight: '250px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.8)',
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

    // ====== 2. 核心辅助函数 ======

    // 提取数字 (处理 1.2k, N/A)
    function parseNum(str) {
        if (!str) return 0;
        if (str.toUpperCase().includes('N/A')) return 0;
        let val = str.replace(/,/g, '').toLowerCase();
        if (val.includes('k')) return parseFloat(val) * 1000;
        if (val.includes('m')) return parseFloat(val) * 1000000;
        return parseFloat(val) || 0;
    }

    // 计算是否超过7天
    // 返回值: true = 是老品(超过7天), false = 是新品(7天内)
    function isOldProduct(dateStr) {
        if (!dateStr) return false; // 没找到时间，默认不敢删
        
        // 你的格式: 09/02/2026 15:36 (DD/MM/YYYY)
        const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return false;

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // 月份0-11
        const year = parseInt(match[3], 10);

        const productDate = new Date(year, month, day);
        const now = new Date();
        
        // 计算天数差
        const diffTime = now - productDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        return diffDays > 7; // 如果大于7天，返回true
    }

    // XPath 工具
    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    // ====== 3. 主执行逻辑 ======
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        const VIEW_LIMIT = parseInt(document.getElementById('tk_view_threshold').value) || 50;
        const MAX_DELETE = parseInt(document.getElementById('tk_max_del').value) || 100;
        const MAX_PAGES = 50; 

        log(`🚀 任务开始! 目标: 删除上架>7天 且 Views < ${VIEW_LIMIT} 的商品`, '#4caf50');

        let totalDeleted = 0;
        let isStopped = false;

        for(let page = 1; page <= MAX_PAGES; page++){
            if(isStopped) break;
            log(`---------- 正在扫描第 ${page} 页 ----------`, '#aaa');

            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){
                log('⚠️ 没有找到商品，可能页面加载慢或已到底', 'orange');
                break;
            }

            let pageDeleteCount = 0;

            for(let i=0; i < rows.length; i++){
                if(totalDeleted >= MAX_DELETE) {
                    isStopped = true;
                    log(`🛑 已达到删除上限 ${MAX_DELETE} 个，停止`, 'red');
                    break;
                }

                const row = rows[i];
                const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                
                // 如果已经勾选了，跳过（避免重复计算）
                if(checkbox && checkbox.checked) continue;

                // --- A. 获取 Views ---
                let viewsMatch = row.innerText.match(/Views:\s*([\dN\/A.,kK]+)/i) || row.innerText.match(/Tayangan:\s*([\dN\/A.,kK]+)/i);
                let viewsStr = viewsMatch ? viewsMatch[1] : 'N/A';
                let viewsVal = parseNum(viewsStr);

                // --- B. 获取时间 (精准定位你提供的class) ---
                // 遍历行内所有可能是时间的元素
                const timeElements = row.querySelectorAll('.text-body-s-regular.text-neutral-text3');
                let dateStr = "";
                for(let el of timeElements) {
                    // 只要包含 / 的，大概率就是日期 (DD/MM/YYYY)
                    if(el.innerText.includes('/') && el.innerText.includes(':')) {
                        dateStr = el.innerText.trim();
                        break;
                    }
                }

                // --- C. 核心判断逻辑 (AND 关系) ---
                
                // 1. 判断时间
                const isOld = isOldProduct(dateStr);
                
                if (!isOld) {
                    // 是新品 (<= 7天) -> 保护
                    // log(`🛡️ [跳过] 新品保护 (${dateStr})`, '#888');
                    continue; 
                }

                // 2. 判断流量 (代码运行到这里，说明已经是老品了)
                if (viewsVal < VIEW_LIMIT) {
                    // 是老品 且 流量低 -> 删！
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        pageDeleteCount++;
                        totalDeleted++;
                        log(`✅ [勾选] 上架:${dateStr} | Views:${viewsStr}`, '#66ff66');
                    }
                } else {
                    // 是老品 但 流量高 -> 留着
                    // log(`➖ [保留] 虽是老品但流量尚可 (${viewsStr})`, '#888');
                }
            }

            // --- 执行删除动作 ---
            if(pageDeleteCount > 0){
                log(`🔥 本页选中 ${pageDeleteCount} 个，准备删除...`, 'yellow');
                await new Promise(r=>setTimeout(r, 2000));

                // 1. 点批量按钮
                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn) { dropdownBtn.click(); await new Promise(r=>setTimeout(r, 800)); }

                // 2. 点 Delete 菜单
                const menuItems = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item, div.core-dropdown-menu-item'));
                const deleteItem = menuItems.find(el => {
                    const txt = el.textContent.trim();
                    return (txt.includes('Delete') && !txt.includes('Deactivate')) || txt === '删除' || txt === 'Hapus';
                });
                if(deleteItem) { deleteItem.click(); await new Promise(r=>setTimeout(r, 1500)); }

                // 3. 勾选弹窗里的确认框
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                modalCheckboxes.forEach(cb => { if(!cb.checked) cb.click(); });
                await new Promise(r=>setTimeout(r, 500));

                // 4. 点红色确认删除
                let confirmBtn = getElementByXpath("/html/body/div[10]/div[2]/div/div[3]/div/button[2]") ||
                                 document.querySelector('button.core-btn-status-danger');
                if(confirmBtn){
                    if(confirmBtn.disabled) await new Promise(r=>setTimeout(r, 500));
                    confirmBtn.click();
                    log(`🗑️ 已确认删除 ${pageDeleteCount} 个商品`, 'red');
                    await new Promise(r=>setTimeout(r, 5000)); // 等待列表刷新
                }
            } else {
                log('👀 本页没有符合条件的废品', '#aaa');
            }

            // 翻页
            if(totalDeleted >= MAX_DELETE) break;
            
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                nextBtn.click();
                log('📄 翻下一页...', 'cyan');
                await new Promise(r=>setTimeout(r, 8000));
            } else {
                log('🏁 所有页面扫描完毕', '#4caf50');
                break;
            }
        }
        log(`🎉 清理结束！共删除 ${totalDeleted} 个僵尸链接`, '#4caf50');
    });
})();
