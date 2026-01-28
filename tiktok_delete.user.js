// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（精准删除版）
// @namespace    http://tampermonkey.net/
// @version      1.9.3
// @description  严格区分删除与下架，精准点击红色 Konfirmasi 确认按钮
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
        cursor: 'pointer'
    });
    document.body.appendChild(btn);

    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '20px', bottom: '60px',
        width: '400px', maxHeight: '400px',
        overflowY: 'auto', backgroundColor: 'rgba(0,0,0,0.8)',
        color: 'white', padding: '8px',
        fontSize: '12px', borderRadius: '4px', zIndex: 9999
    });
    document.body.appendChild(logDiv);

    function log(text){
        const line = document.createElement('div');
        line.innerText = text;
        logDiv.appendChild(line);
        logDiv.scrollTop = logDiv.scrollHeight;
    }

    function getElementByXpath(path) {
        return document.evaluate(path, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
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
        await new Promise(r => setTimeout(r, 500));

        const sortOption = document.querySelector("#product-table-container span > div > div > div:nth-child(2)");
        if (sortOption) {
            sortOption.click();
            log('✅ 已选择第二个排序项');
            await new Promise(r => setTimeout(r, 2000));
        } else {
            log('⚠️ 没找到排序选项');
        }
    }

    btn.addEventListener('click', async () => {
        await sortBeforeDelete(); 
        let totalDeleted = 0;
        for(let page=1; page<=MAX_PAGES; page++){
            log(`🔹 开始第 ${page} 页处理`);

            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){
                log('⚠️ 没找到商品行');
                break;
            }

            let deleteCount = 0;

            for(let i=0;i<rows.length;i++){
                const row = rows[i];
                // 兼容印尼语解析
                let soldMatch = row.innerText.match(/销量:\s*([\dN\/A]+)/i) || row.innerText.match(/([\dN\/A]+)\s*produk terjual/i);
                let sold = soldMatch ? soldMatch[1] : 'N/A';

                let viewsMatch = row.innerText.match(/Views:\s*([\dN\/A]+)/i) || row.innerText.match(/Tayangan:\s*([\dN\/A]+)/i);
                let views = viewsMatch ? viewsMatch[1] : 'N/A';

                const lineText = `行 ${i+1} | 销量: ${sold} | Views: ${views}`;
                const shouldSelect = (sold==='N/A' || sold==='0') && (views==='N/A' || views==='0');

                if(shouldSelect){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        deleteCount++;
                        log(lineText + ' ✅勾选');
                    }
                }
            }

            totalDeleted += deleteCount;
            log(`本页勾选 ${deleteCount} 个商品，总删除计数 ${totalDeleted}`);

            if(deleteCount > 0){
                log('等待 3 秒，准备点击菜单...');
                await new Promise(r=>setTimeout(r,3000));

                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ dropdownBtn.click(); await new Promise(r=>setTimeout(r,800)); }

                // --- 精准定位“删除”选项，排除“下架(Deactivate)” ---
                const menuItems = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item, div.core-dropdown-menu-item'));
                const deleteItem = menuItems.find(el => {
                    const txt = el.textContent.trim();
                    // 必须包含 Delete 但不能包含 Deactivate，或者匹配 Hapus/删除
                    return (txt === 'Delete' || txt.includes('Delete') && !txt.includes('Deactivate')) || 
                           txt === 'Hapus' || 
                           txt === '删除' ||
                           el.querySelector('svg.arco-icon-delete'); // 如果有垃圾桶图标也行
                });

                if(deleteItem){ 
                    deleteItem.click(); 
                    log('✅ 已点击 Delete（删除）'); 
                    await new Promise(r=>setTimeout(r,1500)); 
                } else {
                    log('❌ 未找到删除选项，请检查菜单内容');
                }

                // 勾选所有平台
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                if(modalCheckboxes.length>0){
                    modalCheckboxes.forEach(cb=>{ if(!cb.checked) cb.click(); });
                    log(`✅ 已勾选所有平台`);
                    await new Promise(r=>setTimeout(r,800));
                }

                // --- 强化：点击红色的 Konfirmasi / Confirm 按钮 ---
                let confirmBtn = getElementByXpath("/html/body/div[10]/div[2]/div/div[3]/div/button[2]") || 
                                 document.querySelector('button.core-btn-status-danger') || 
                                 document.querySelector('div.core-modal-footer button.core-btn-primary');

                if(confirmBtn){
                    let attempts = 0;
                    while(confirmBtn.disabled && attempts<20){
                        await new Promise(r=>setTimeout(r,500));
                        attempts++;
                    }
                    confirmBtn.click();
                    log('✅ 已点击确认按钮');
                    await new Promise(r=>setTimeout(r,2000));
                } else {
                    log('⚠️ 没找到确认按钮');
                }

                log('等待 8 秒再翻页...');
                await new Promise(r=>setTimeout(r,8000));
            }

            if(totalDeleted >= MAX_DELETE){
                log(`⚠️ 删除总数已达到 ${MAX_DELETE}，停止循环`);
                break;
            }

            // 翻页
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                nextBtn.click();
                await new Promise(r=>setTimeout(r,10000));
            } else {
                log('⚠️ 没找到下一页按钮，停止翻页');
                break;
            }
        }

        localStorage.setItem(TODAY_KEY,today);
        log(`✅ 脚本执行完毕，总处理 ${totalDeleted} 个商品`);
    });
})();
