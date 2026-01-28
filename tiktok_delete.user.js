// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（确认按钮强化版）
// @namespace    http://tampermonkey.net/
// @version      1.9.2
// @description  解决红色 Konfirmasi 确认按钮不点击的问题，支持 XPath 和精确类名定位
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const MAX_PAGES = 10;
    const MAX_DELETE = 80;
    const TODAY_KEY = 'ttshop_deleted_today';
    const today = new Date().toLocaleDateString();

    const btn = document.createElement('button');
    btn.innerText = '批量删除销量/Views N/A商品';
    Object.assign(btn.style, {
        position: 'fixed', left: '20px', bottom: '20px',
        zIndex: 9999, padding: '8px 12px',
        backgroundColor: '#E53935', color: 'white',
        border: 'none', borderRadius: '4px', cursor: 'pointer'
    });
    document.body.appendChild(btn);

    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '20px', bottom: '60px',
        width: '400px', maxHeight: '400px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white', padding: '8px', fontSize: '12px', borderRadius: '4px', zIndex: 9999
    });
    document.body.appendChild(logDiv);

    function log(text){
        const line = document.createElement('div');
        line.innerText = text;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    async function sortBeforeDelete() {
        const sortBtnWrapper = document.querySelector("#product-table-container > div.py-16.flex.justify-between.items-start > div:nth-child(2) > button");
        if (!sortBtnWrapper) return;
        sortBtnWrapper.click();
        await new Promise(r => setTimeout(r, 500));
        const sortOption = document.querySelector("#product-table-container span > div > div > div:nth-child(2)");
        if (sortOption) {
            sortOption.click();
            log('✅ 排序已执行');
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    // 通过 XPath 查找元素的工具函数
    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    }

    btn.addEventListener('click', async () => {
        await sortBeforeDelete(); 
        let totalDeleted = 0;
        for(let page=1; page<=MAX_PAGES; page++){
            log(`🔹 开始第 ${page} 页处理`);
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){ log('⚠️ 没找到商品行'); break; }

            let deleteCount = 0;
            for(let i=0;i<rows.length;i++){
                const row = rows[i];
                let soldMatch = row.innerText.match(/销量:\s*([\dN\/A]+)/i) || row.innerText.match(/([\dN\/A]+)\s*produk terjual/i);
                let sold = soldMatch ? soldMatch[1] : 'N/A';
                let viewsMatch = row.innerText.match(/Views:\s*([\dN\/A]+)/i) || row.innerText.match(/Tayangan:\s*([\dN\/A]+)/i);
                let views = viewsMatch ? viewsMatch[1] : 'N/A';

                if((sold==='N/A' || sold==='0') && (views==='N/A' || views==='0')){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        deleteCount++;
                    }
                }
            }

            totalDeleted += deleteCount;
            log(`本页勾选 ${deleteCount} 个，总计数 ${totalDeleted}`);

            if(deleteCount > 0){
                await new Promise(r=>setTimeout(r,3000));
                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ dropdownBtn.click(); await new Promise(r=>setTimeout(r,800)); }

                const deleteItem = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item')).find(el => el.innerText.match(/Delete|Hapus|删除/i));
                if(deleteItem){ deleteItem.click(); log('✅ 点击删除'); await new Promise(r=>setTimeout(r,1500)); }

                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                modalCheckboxes.forEach(cb=>{ if(!cb.checked) cb.click(); });
                await new Promise(r=>setTimeout(r,1000));

                // --- 强化确认点击逻辑 ---
                let confirmBtn = null;
                
                // 1. 尝试使用你提供的 XPath
                confirmBtn = getElementByXpath("/html/body/div[10]/div[2]/div/div[3]/div/button[2]");
                
                // 2. 如果没有，使用精确类名匹配 (红色危险按钮)
                if(!confirmBtn){
                    confirmBtn = document.querySelector('button.core-btn-status-danger.pulse-button-size-large');
                }
                
                // 3. 如果还没有，按文字 Konfirmasi 查找
                if(!confirmBtn){
                    confirmBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Konfirmasi') || b.innerText.includes('Confirm'));
                }

                if(confirmBtn){
                    log(`🎯 找到确认按钮，正在检测状态...`);
                    let attempts = 0;
                    while(confirmBtn.disabled && attempts < 20){
                        await new Promise(r=>setTimeout(r,500));
                        attempts++;
                    }
                    confirmBtn.click();
                    log('✅ 已点击确认 (Konfirmasi)');
                } else {
                    log('❌ 无法定位确认按钮');
                }

                log('等待翻页...');
                await new Promise(r=>setTimeout(r,8000));
            }

            if(totalDeleted >= MAX_DELETE) break;
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){ nextBtn.click(); await new Promise(r=>setTimeout(r,10000)); } else break;
        }
        localStorage.setItem(TODAY_KEY,today);
        log(`✅ 完毕，共处理 ${totalDeleted} 商品`);
    });
})();
