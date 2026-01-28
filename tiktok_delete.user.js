// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（中/印尼双语版）
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  批量删除销量+Views为N/A商品，兼容中文与印尼语界面，分页循环，删除上限控制
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ====== 可配置变量 ======
    const MAX_PAGES = 10;      // 默认最多翻页次数
    const MAX_DELETE = 80;     // 默认总删除数量上限
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
        boxShadow: '0 0 10px rgba(0,0,0,0.5)', pointerEvents: 'none'
    });
    document.body.appendChild(logDiv);

    function log(text){
        const line = document.createElement('div');
        line.style.borderBottom = '1px solid #333';
        line.style.padding = '2px 0';
        line.innerText = `[${new Date().toLocaleTimeString()}] ${text}`;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    // 点击排序按钮 + 选择第二个排序选项
    async function sortBeforeDelete() {
        const sortBtnWrapper = document.querySelector("#product-table-container > div.py-16.flex.justify-between.items-start > div:nth-child(2) > button");
        if (!sortBtnWrapper) {
            log('⚠️ 没找到排序按钮外层');
            return;
        }
        sortBtnWrapper.click();
        log('✅ 点击排序按钮外层');
        await new Promise(r => setTimeout(r, 800));

        const sortOption = document.querySelector("#product-table-container span > div > div > div:nth-child(2)");
        if (sortOption) {
            sortOption.click();
            log('✅ 已选择第二个排序项');
            await new Promise(r => setTimeout(r, 2500));
        } else {
            log('⚠️ 没找到排序选项');
        }
    }

    // 解析行数据（核心改进：兼容多语言）
    function parseRowData(rowText) {
        // 1. 匹配销量 (Sold / 销量 / produk terjual)
        // 中/英通常是 "销量: 0", 印尼语通常是 "0 produk terjual"
        let soldMatch = rowText.match(/销量:\s*([\dN\/A]+)/i) || 
                        rowText.match(/([\dN\/A]+)\s*produk terjual/i) ||
                        rowText.match(/Sold:\s*([\dN\/A]+)/i);
        let sold = soldMatch ? soldMatch[1] : 'N/A';

        // 2. 匹配 Views (Views / Tayangan)
        let viewsMatch = rowText.match(/Views:\s*([\dN\/A]+)/i) || 
                         rowText.match(/Tayangan:\s*([\dN\/A]+)/i);
        let views = viewsMatch ? viewsMatch[1] : 'N/A';

        return { sold, views };
    }

    btn.addEventListener('click', async () => {
        log('🚀 脚本开始运行...');
        await sortBeforeDelete();
        
        let totalDeleted = 0;
        for(let page=1; page<=MAX_PAGES; page++){
            log(`🔹 开始第 ${page} 页处理`);

            // 确保页面加载完成
            await new Promise(r => setTimeout(r, 2000));
            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            
            if(rows.length === 0){
                log('⚠️ 没找到商品行，等待重试...');
                await new Promise(r => setTimeout(r, 3000));
            }

            let pageSelected = 0;

            for(let i=0; i<rows.length; i++){
                if (totalDeleted + pageSelected >= MAX_DELETE) break;

                const row = rows[i];
                const { sold, views } = parseRowData(row.innerText);
                
                // 判断逻辑: 销量为 0 或 N/A 且 Views 为 0 或 N/A
                const isSoldLow = (sold === 'N/A' || sold === '0');
                const isViewsLow = (views === 'N/A' || views === '0');

                if(isSoldLow && isViewsLow){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        pageSelected++;
                        log(`行 ${i+1} | 销量: ${sold} | Views: ${views} ✅勾选`);
                    }
                }
            }

            if(pageSelected > 0){
                log(`本页勾选 ${pageSelected} 个商品，准备执行删除...`);
                await new Promise(r=>setTimeout(r,2000));

                // 点击 Bulk Action 下拉
                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ 
                    dropdownBtn.click(); 
                    await new Promise(r=>setTimeout(r,800)); 
                }

                // 点击 Delete 菜单项
                const deleteItem = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item'))
                                       .find(el => el.innerText.includes('Delete') || el.innerText.includes('Hapus'));
                
                if(deleteItem){ 
                    deleteItem.click(); 
                    log('✅ 已点击 Delete/Hapus'); 
                    await new Promise(r=>setTimeout(r,1500)); 
                }

                // 勾选所有平台 (Modal)
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                if(modalCheckboxes.length > 0){
                    modalCheckboxes.forEach(cb => { if(!cb.checked) cb.click(); });
                    log(`✅ 确认框：已勾选所有平台`);
                    await new Promise(r=>setTimeout(r,800));
                }

                // 确认 Confirm 按钮
                let confirmBtn = document.querySelector('div.core-modal-content button.core-btn-primary');
                if(confirmBtn){
                    let attempts = 0;
                    while(confirmBtn.disabled && attempts < 20){
                        await new Promise(r=>setTimeout(r,500));
                        confirmBtn = document.querySelector('div.core-modal-content button.core-btn-primary');
                        attempts++;
                    }
                    confirmBtn.click();
                    log('✅ 已点击 Confirm');
                    totalDeleted += pageSelected;
                    await new Promise(r=>setTimeout(r,3000)); 
                }

                log('等待页面刷新数据...');
                await new Promise(r=>setTimeout(r,5000));
            } else {
                log('⏭️ 本页无符合条件的商品');
            }

            if(totalDeleted >= MAX_DELETE){
                log(`⚠️ 已达删除上限 ${MAX_DELETE}，停止任务`);
                break;
            }

            // 翻页逻辑
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                log('➡️ 正在翻往下一页...');
                nextBtn.click();
                await new Promise(r=>setTimeout(r,8000)); // 翻页后等待较长时间确保列表刷新
            } else {
                log('⚠️ 没找到下一页按钮或已到底，停止任务');
                break;
            }
        }

        localStorage.setItem(TODAY_KEY, today);
        log(`✅ 脚本处理结束，本次总计删除勾选了 ${totalDeleted} 个商品`);
    });
})();
