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

    // ====== UI 面板构建 ======
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed', left: '20px', bottom: '20px',
        zIndex: 9999, padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', color: 'white',
        borderRadius: '8px', fontSize: '12px', width: '240px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
    });

    panel.innerHTML = `
        <div style="margin-bottom:8px;font-weight:bold;color:#4caf50;border-bottom:1px solid #555;padding-bottom:5px;">
            批量删除 (含新品保护)
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <label>跳过前N条:</label>
            <input type="number" id="tk_skip_num" value="0" style="width:50px;color:black;text-align:center;">
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <label>最大删除数:</label>
            <input type="number" id="tk_max_del" value="100" style="width:50px;color:black;text-align:center;">
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <label>Views低于:</label>
            <input type="number" id="tk_view_threshold" value="50" style="width:50px;color:black;text-align:center;">
        </div>
        <div style="margin-bottom:10px;color:#aaa;font-size:10px;">
            * 自动跳过上架不足7天的商品
        </div>
        <button id="tk_start_btn" style="width:100%;padding:6px;background:#E53935;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
            开始执行
        </button>
    `;
    document.body.appendChild(panel);

    // 日志窗口
    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '270px', bottom: '20px',
        width: '350px', maxHeight: '300px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white', padding: '8px',
        fontSize: '12px', borderRadius: '4px', zIndex: 9999
    });
    document.body.appendChild(logDiv);

    function log(text){
        const line = document.createElement('div');
        line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    function parseNum(str) {
        if (!str) return 0;
        if (str.toUpperCase().includes('N/A')) return 0;
        let val = str.replace(/,/g, '').toLowerCase();
        if (val.includes('k')) return parseFloat(val) * 1000;
        if (val.includes('m')) return parseFloat(val) * 1000000;
        return parseFloat(val) || 0;
    }

    // --- 新增：判断日期是否在7天内 ---
    function isWithin7Days(dateStr) {
        if (!dateStr) return false;
        // 提取日期部分，假设格式为 DD/MM/YYYY HH:MM
        // 正则匹配 DD/MM/YYYY
        const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (!match) return false;

        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1; // JS月份从0开始
        const year = parseInt(match[3], 10);

        const productDate = new Date(year, month, day);
        const now = new Date();
        const diffTime = now - productDate;
        const diffDays = diffTime / (1000 * 60 * 60 * 24);

        return diffDays < 7;
    }

    // ====== 主逻辑 ======
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        const SKIP_COUNT = parseInt(document.getElementById('tk_skip_num').value) || 0;
        const MAX_DELETE = parseInt(document.getElementById('tk_max_del').value) || 100;
        const SOLD_LIMIT = 0; // 销量通常都是0才删
        const VIEW_LIMIT = parseInt(document.getElementById('tk_view_threshold').value) || 50;
        const MAX_PAGES = 50;

        log(`🚀 开始: 删${MAX_DELETE}个, Views<${VIEW_LIMIT}, 保护7天内新品`);

        let totalDeleted = 0;
        let totalProcessed = 0;
        let isStopped = false;

        for(let page=1; page<=MAX_PAGES; page++){
            if(isStopped) break;
            log(`🔹 第 ${page} 页处理中...`);

            // 每次翻页重新获取行元素
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){
                log('⚠️ 未找到商品行，可能已到底或网络卡顿');
                break;
            }

            let pageDeleteCount = 0;

            for(let i=0; i<rows.length; i++){
                if(totalDeleted >= MAX_DELETE) {
                    isStopped = true;
                    log(`🛑 已达删除上限 (${MAX_DELETE}个)`);
                    break;
                }

                const row = rows[i];

                // 1. 跳过前 N 个逻辑
                if (totalProcessed < SKIP_COUNT) {
                    totalProcessed++;
                    continue;
                }
                totalProcessed++;

                // 2. --- 新增：获取时间并判断 ---
                // 查找包含日期的元素，遍历该行内所有符合class的元素，找到符合日期格式的
                const textElements = row.querySelectorAll('.text-body-s-regular.text-neutral-text3');
                let productDateStr = '';
                for (let el of textElements) {
                    // 简单的正则判断是否包含日期格式 DD/MM/YYYY
                    if (/\d{2}\/\d{2}\/\d{4}/.test(el.innerText)) {
                        productDateStr = el.innerText.trim();
                        break;
                    }
                }

                if (isWithin7Days(productDateStr)) {
                    // 如果不足7天，跳过该商品
                    // log(`🛡️ [保护新品] 上架时间 ${productDateStr} 不足7天，跳过`);
                    continue;
                }
                // -----------------------------

                // 3. 原有销量/Views 判断逻辑
                let soldMatch = row.innerText.match(/销量:\s*([\dN\/A.,kK]+)/i) || row.innerText.match(/Sold\s*([\dN\/A.,kK]+)/i);
                let soldStr = soldMatch ? soldMatch[1] : 'N/A';

                let viewsMatch = row.innerText.match(/Views:\s*([\dN\/A.,kK]+)/i) || row.innerText.match(/Tayangan:\s*([\dN\/A.,kK]+)/i);
                let viewsStr = viewsMatch ? viewsMatch[1] : 'N/A';

                let soldVal = parseNum(soldStr);
                let viewsVal = parseNum(viewsStr);

                const shouldSelect = (soldVal <= SOLD_LIMIT) && (viewsVal <= VIEW_LIMIT);

                if(shouldSelect){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        pageDeleteCount++;
                        totalDeleted++;
                        log(`✅ [选中] Views:${viewsStr}, Date:${productDateStr}`);
                    }
                }
            }

            // 执行删除操作
            if(pageDeleteCount > 0){
                log(`本页选中 ${pageDeleteCount} 个，执行删除...`);
                await new Promise(r=>setTimeout(r,2000));

                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ dropdownBtn.click(); await new Promise(r=>setTimeout(r,800)); }

                const menuItems = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item, div.core-dropdown-menu-item'));
                const deleteItem = menuItems.find(el => {
                    const txt = el.textContent.trim();
                    return (txt.includes('Delete') && !txt.includes('Deactivate')) || txt === '删除' || txt === 'Hapus';
                });

                if(deleteItem){
                    deleteItem.click();
                    await new Promise(r=>setTimeout(r,1500));
                }

                // 勾选弹窗复选框
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                modalCheckboxes.forEach(cb=>{ if(!cb.checked) cb.click(); });
                await new Promise(r=>setTimeout(r,500));

                // 点击确认删除
                let confirmBtn = getElementByXpath("/html/body/div[10]/div[2]/div/div[3]/div/button[2]") ||
                                 document.querySelector('button.core-btn-status-danger');

                if(confirmBtn){
                    if(confirmBtn.disabled) await new Promise(r=>setTimeout(r,500));
                    confirmBtn.click();
                    log('🔴 已确认删除');
                    await new Promise(r=>setTimeout(r,4000)); // 等待刷新
                }
            } else {
                log('👀 本页无符合删除条件的商品');
            }

            if(totalDeleted >= MAX_DELETE) break;

            // 翻页
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                nextBtn.click();
                log('📄 翻下一页...');
                await new Promise(r=>setTimeout(r,6000));
            } else {
                log('🏁 无下一页，任务结束');
                break;
            }
        }
        log(`🎉 任务完成，共删除 ${totalDeleted} 个`);
    });
})();
