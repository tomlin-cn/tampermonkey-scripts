// ==UserScript==
// @name         TikTok 小店 批量删除/下架销量Views N/A商品
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  批量删除或下架销量+Views为N/A商品，兼容红色危险确认按钮，支持中/印尼双语
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ====== 可配置变量 ======
    const MAX_PAGES = 10;      
    const MAX_DELETE = 80;     
    // ========================

    const TODAY_KEY = 'ttshop_deleted_today';
    const today = new Date().toLocaleDateString();

    const btn = document.createElement('button');
    btn.innerText = '批量删除销量/Views N/A商品';
    Object.assign(btn.style, {
        position: 'fixed', left: '20px', bottom: '20px',
        zIndex: 9999, padding: '8px 12px',
        backgroundColor: '#E53935', color: 'white',
        border: 'none', borderRadius: '4px',
        cursor: 'pointer', fontWeight: 'bold'
    });
    document.body.appendChild(btn);

    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '20px', bottom: '60px',
        width: '400px', maxHeight: '400px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.9)',
        color: 'white', padding: '10px',
        fontSize: '12px', borderRadius: '4px', zIndex: 9999,
        pointerEvents: 'none'
    });
    document.body.appendChild(logDiv);

    function log(text){
        const line = document.createElement('div');
        line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    async function sortBeforeDelete() {
        const sortBtnWrapper = document.querySelector("#product-table-container div.py-16 button");
        if (!sortBtnWrapper) return;
        sortBtnWrapper.click();
        await new Promise(r => setTimeout(r, 1000));
        const sortOption = document.querySelector("#product-table-container span > div > div > div:nth-child(2)");
        if (sortOption) {
            sortOption.click();
            log('✅ 已完成列表排序');
            await new Promise(r => setTimeout(r, 2500));
        }
    }

    function parseRowData(rowText) {
        let soldMatch = rowText.match(/销量:\s*([\dN\/A]+)/i) || 
                        rowText.match(/([\dN\/A]+)\s*produk terjual/i) ||
                        rowText.match(/Sold:\s*([\dN\/A]+)/i);
        let sold = soldMatch ? soldMatch[1] : 'N/A';

        let viewsMatch = rowText.match(/Views:\s*([\dN\/A]+)/i) || 
                         rowText.match(/Tayangan:\s*([\dN\/A]+)/i);
        let views = viewsMatch ? viewsMatch[1] : 'N/A';

        return { sold, views };
    }

    btn.addEventListener('click', async () => {
        log('🚀 开始执行任务...');
        await sortBeforeDelete();
        
        let totalDeleted = 0;
        for(let page=1; page<=MAX_PAGES; page++){
            log(`🔹 处理第 ${page} 页`);
            await new Promise(r => setTimeout(r, 2000));
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            
            if(rows.length === 0){
                log('⚠️ 没找到商品，尝试重试');
                await new Promise(r => setTimeout(r, 3000));
            }

            let pageSelected = 0;
            for(let i=0; i<rows.length; i++){
                if (totalDeleted + pageSelected >= MAX_DELETE) break;
                const row = rows[i];
                const { sold, views } = parseRowData(row.innerText);
                if((sold === 'N/A' || sold === '0') && (views === 'N/A' || views === '0')){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        pageSelected++;
                        log(`勾选：销量(${sold}) Views(${views})`);
                    }
                }
            }

            if(pageSelected > 0){
                log(`本页勾选 ${pageSelected} 个，准备删除/下架...`);
                await new Promise(r=>setTimeout(r,2000));

                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn) dropdownBtn.click();
                await new Promise(r=>setTimeout(r,1000));

                const deleteItem = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item'))
                                       .find(el => el.innerText.match(/Delete|Hapus|删除/i));
                
                if(deleteItem){ 
                    deleteItem.click(); 
                    await new Promise(r=>setTimeout(r,1500)); 

                    // 勾选弹窗内的所有平台
                    const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                    modalCheckboxes.forEach(cb => { if(!cb.checked) cb.click(); });
                    await new Promise(r=>setTimeout(r,1000));

                    // --- 核心确认逻辑改进 ---
                    // 寻找 蓝色主按钮 或 红色危险按钮
                    let confirmBtn = document.querySelector('div.core-modal-content button.core-btn-primary, div.core-modal-content button.core-btn-status-danger');
                    
                    // 如果没搜到，按文字内容搜
                    if(!confirmBtn) {
                        confirmBtn = Array.from(document.querySelectorAll('div.core-modal-content button'))
                                          .find(b => b.innerText.match(/Confirm|Konfirmasi|确定|Hapus|Delete/i));
                    }

                    if(confirmBtn){
                        let attempts = 0;
                        // 循环等待按钮变为可用状态（例如加载平台列表后按钮才会亮）
                        while(confirmBtn.disabled && attempts < 20){
                            await new Promise(r=>setTimeout(r,500));
                            attempts++;
                        }
                        confirmBtn.click();
                        log(`✅ 已点击确认按钮 (${confirmBtn.innerText.trim()})`);
                        totalDeleted += pageSelected;
                        await new Promise(r=>setTimeout(r,3000)); 
                    } else {
                        log('❌ 错误：未能找到确认按钮');
                    }
                }
                await new Promise(r=>setTimeout(r,5000));
            }

            if(totalDeleted >= MAX_DELETE) break;

            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                log('➡️ 翻页中...');
                nextBtn.click();
                await new Promise(r=>setTimeout(r,8000));
            } else {
                log('🏁 已到底部或无法翻页');
                break;
            }
        }
        log(`✅ 任务完成，累计处理 ${totalDeleted} 个商品`);
    });
})();
