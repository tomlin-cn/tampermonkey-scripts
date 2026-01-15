// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品
// @namespace    https://github.com/你的GitHub用户名/tampermonkey-scripts
// @version      1.0.1
// @updateURL    https://raw.githubusercontent.com/你的GitHub用户名/tampermonkey-scripts/main/tiktok_delete.user.js
// @downloadURL  https://raw.githubusercontent.com/你的GitHub用户名/tampermonkey-scripts/main/tiktok_delete.user.js
// @match        *://*/*
// @grant        none
// ==/UserScript==
// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（可配置分页+删除上限）
// @namespace    http://tampermonkey.net/
// @version      1.9
// @description  批量删除销量+Views为N/A商品，分页循环，可配置翻页次数和删除总数上限，日志滚动，Confirm稳定点击
// @author       ChatGPT
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // ====== 可配置变量 ======
    const MAX_PAGES = 10;      // 默认最多翻页次数
    const MAX_DELETE = 100;     // 默认总删除数量上限
    // ========================

    const TODAY_KEY = 'ttshop_deleted_today';


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
    // 点击排序按钮 + 选择第二个排序选项
    async function clickSortButton() {
        let btn = null;
        for(let i=0;i<20;i++){
            btn = document.querySelector("#product-table-container > div.py-16.flex.justify-between.items-start > div:nth-child(2) > button");
            if(btn) break;
            await new Promise(r=>setTimeout(r,500));
        }
        if(!btn){ console.log('⚠️ 没找到排序按钮'); return; }

        // 手动触发事件
        ['mousedown','mouseup','click'].forEach(ev => {
            btn.dispatchEvent(new MouseEvent(ev,{bubbles:true}));
        });

        console.log('✅ 已点击排序按钮，等待下拉渲染...');
        await new Promise(r=>setTimeout(r,500));

        const option = document.querySelector("#product-table-container span > div > div > div:nth-child(2)");
        if(option){
            ['mousedown','mouseup','click'].forEach(ev => option.dispatchEvent(new MouseEvent(ev,{bubbles:true})));
            console.log('✅ 已选择第二个排序项，等待排序生效...');
            await new Promise(r=>setTimeout(r,2000));
        } else {
            console.log('⚠️ 没找到排序选项');
        }
    }




    btn.addEventListener('click', async () => {
        await clickSortButton(); // ✅ 排序执行
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
                let sold = (row.innerText.match(/销量:\s*([\dN/A]+)/i)||[])[1] || 'N/A';
                let views = (row.innerText.match(/Views:\s*([\dN/A]+)/i)||[])[1] || 'N/A';
                const lineText = `行 ${i+1} | 销量: ${sold} | Views: ${views}`;
                if(sold==='N/A' && views==='N/A'){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){ checkbox.click(); deleteCount++; log(lineText + ' ✅勾选'); }
                } else {
                    log(lineText);
                }
            }

            totalDeleted += deleteCount;
            log(`本页勾选 ${deleteCount} 个商品，总删除计数 ${totalDeleted}`);

            if(deleteCount > 0){
                // 本页有勾选才执行删除操作
                log('等待 5 秒，准备点击 Delete...');
                await new Promise(r=>setTimeout(r,5000));

                const dropdownBtn = document.querySelector("body > div.pulse-bulk-action-wrapper.pulse-bulk-action-size-default.react-draggable div.pulse-dropdown.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ dropdownBtn.click(); await new Promise(r=>setTimeout(r,500)); }

                const deleteItem = document.querySelector('div.pulse-dropdown-menu-item');
                if(deleteItem){ deleteItem.click(); log('✅ 已点击 Delete'); await new Promise(r=>setTimeout(r,1000)); }

                // 勾选所有平台
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                if(modalCheckboxes.length>0){
                    modalCheckboxes.forEach(cb=>{ if(!cb.checked) cb.click(); });
                    log(`✅ 已勾选 ${modalCheckboxes.length} 个平台`);
                    await new Promise(r=>setTimeout(r,500));
                }

                // 更稳健 Confirm
                let confirmBtn = document.querySelector('div.core-modal-content button.core-btn-primary');
                if(confirmBtn){
                    let attempts = 0;
                    while(confirmBtn.disabled && attempts<20){
                        await new Promise(r=>setTimeout(r,500));
                        confirmBtn = document.querySelector('div.core-modal-content button.core-btn-primary');
                        attempts++;
                    }
                    confirmBtn.click();
                    log('✅ 已点击 Confirm');
                    await new Promise(r=>setTimeout(r,1000));
                } else {
                    log('⚠️ 没找到 Confirm 按钮');
                }

                // 删除后延迟 10 秒再翻页
                log('等待 10 秒再翻页...');
                await new Promise(r=>setTimeout(r,6000));
            }

            if(totalDeleted >= MAX_DELETE){
                log(`⚠️ 删除总数已达到 ${MAX_DELETE}，停止循环`);
                break;
            }

            // 翻页
            const nextBtn = document.querySelector("#product-table-container .core-pagination-item.core-pagination-item-next");
            if(nextBtn){
                nextBtn.click();
                // 下一页加载延迟
                await new Promise(r=>setTimeout(r,10000));
            } else {
                log('⚠️ 没找到下一页按钮，停止翻页');
                break;
            }
        }

        localStorage.setItem(TODAY_KEY,today);
        log(`✅ 脚本执行完毕，总删除 ${totalDeleted} 个商品`);
    });
})();
