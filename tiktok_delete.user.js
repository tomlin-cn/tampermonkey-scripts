// ==UserScript==
// @name         TikTok 小店 批量删除销量/Views N/A 商品（精准删除版）
// @namespace    http://tampermonkey.net/
// @updateURL    https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @downloadURL  https://raw.githubusercontent.com/tomlin-cn/tampermonkey-scripts/main/tiktok_delete.user.js
// @version      2.0.2
// @description  严格区分删除与下架，精准点击红色 Konfirmasi 确认按钮
// @author       ChatGPT
// @match        https://seller-id.tokopedia.com/product/manage*
// @grant        none
// ==/UserScript==


(function() {
    'use strict';

    // ====== UI 面板构建 (替换原来的单按钮) ======
    const panel = document.createElement('div');
    Object.assign(panel.style, {
        position: 'fixed', left: '20px', bottom: '20px',
        zIndex: 9999, padding: '12px',
        backgroundColor: 'rgba(0, 0, 0, 0.85)', color: 'white',
        borderRadius: '8px', fontSize: '12px', width: '240px',
        boxShadow: '0 4px 10px rgba(0,0,0,0.3)'
    });

    panel.innerHTML = `
        <div style="margin-bottom:8px;font-weight:bold;color:#ff6b6b;border-bottom:1px solid #555;padding-bottom:5px;">
            批量删除配置 (原版逻辑增强)
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <label>跳过前N条:</label>
            <input type="number" id="tk_skip_num" value="0" style="width:50px;color:black;text-align:center;">
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
            <label>最大删除数:</label>
            <input type="number" id="tk_max_del" value="80" style="width:50px;color:black;text-align:center;">
        </div>

        <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <label>Views低于:</label>
            <input type="number" id="tk_view_threshold" value="0" style="width:50px;color:black;text-align:center;">
        </div>
        <button id="tk_start_btn" style="width:100%;padding:6px;background:#E53935;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">
            开始执行
        </button>
        <div style="margin-top:5px;font-size:10px;color:#aaa;">* N/A 视为 0</div>
    `;
    document.body.appendChild(panel);

    // 日志窗口 (保持原版)
    const logDiv = document.createElement('div');
    Object.assign(logDiv.style, {
        position: 'fixed', left: '270px', bottom: '20px', // 稍微移一下位置，避开面板
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

    // 数值转换辅助函数 (处理 1.2k, N/A 等)
    function parseNum(str) {
        if (!str) return 0;
        if (str.toUpperCase().includes('N/A')) return 0;
        let val = str.replace(/,/g, '').toLowerCase();
        if (val.includes('k')) return parseFloat(val) * 1000;
        if (val.includes('m')) return parseFloat(val) * 1000000;
        return parseFloat(val) || 0;
    }

    // 排序逻辑 (保持原版)
    async function sortBeforeDelete() {
        const sortBtnWrapper = document.querySelector("#product-table-container > div.py-16.flex.justify-between.items-start > div:nth-child(2) > button");
        if (!sortBtnWrapper) {
            log('⚠️ 没找到排序按钮外层 (可能已改版或网络慢)，跳过排序');
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

    // ====== 主逻辑 (完全保留原版结构，仅修改判断条件) ======
    document.getElementById('tk_start_btn').addEventListener('click', async () => {
        // 1. 获取面板配置
        const SKIP_COUNT = parseInt(document.getElementById('tk_skip_num').value) || 0;
        const MAX_DELETE = parseInt(document.getElementById('tk_max_del').value) || 80;
        const SOLD_LIMIT = 0;
        const VIEW_LIMIT = parseInt(document.getElementById('tk_view_threshold').value) || 0;
        const MAX_PAGES = 20; // 稍微改大一点防止不够翻

        log(`🚀 开始任务: 跳过前${SKIP_COUNT}个, 删${MAX_DELETE}个, 销量<${SOLD_LIMIT}, Views<${VIEW_LIMIT}`);

        // ======await sortBeforeDelete();

        let totalDeleted = 0;       // 总删除计数
        let totalProcessed = 0;     // 总遍历计数 (用于跳过逻辑)
        let isStopped = false;      // 停止标志

        for(let page=1; page<=MAX_PAGES; page++){
            if(isStopped) break;
            log(`🔹 开始第 ${page} 页处理`);

            const rows = document.querySelectorAll('tr.core-table-tr.core-table-row-expanded');
            if(rows.length === 0){
                log('⚠️ 没找到商品行，可能是加载慢或到底了');
                break;
            }

            let pageDeleteCount = 0; // 本页待删除计数

            for(let i=0; i<rows.length; i++){
                // 如果已达到最大删除数，停止循环
                if(totalDeleted >= MAX_DELETE) {
                    isStopped = true;
                    log(`🛑 已达到最大删除限制 (${MAX_DELETE}个)，停止选中`);
                    break;
                }

                const row = rows[i];

                // --- 新增：跳过逻辑 ---
                if (totalProcessed < SKIP_COUNT) {
                    totalProcessed++;
                    // log(`跳过第 ${totalProcessed} 个商品 (保护中)`);
                    continue; // 直接看下一个商品
                }
                totalProcessed++;
                // --------------------

                // 原版正则提取逻辑
                let soldMatch = row.innerText.match(/销量:\s*([\dN\/A.,kK]+)/i) || row.innerText.match(/([\dN\/A.,kK]+)\s*produk terjual/i) || row.innerText.match(/Sold\s*([\dN\/A.,kK]+)/i);
                let soldStr = soldMatch ? soldMatch[1] : 'N/A';

                let viewsMatch = row.innerText.match(/Views:\s*([\dN\/A.,kK]+)/i) || row.innerText.match(/Tayangan:\s*([\dN\/A.,kK]+)/i);
                let viewsStr = viewsMatch ? viewsMatch[1] : 'N/A';

                // --- 新增：数值转换与判断 ---
                let soldVal = parseNum(soldStr);
                let viewsVal = parseNum(viewsStr);

                // 判断条件：销量 <= 阈值 且 Views <= 阈值
                // (注意：原版是 N/A 或 0，这里 N/A 会被 parseNum 转为 0，所以逻辑兼容)
                const shouldSelect = (soldVal <= SOLD_LIMIT) && (viewsVal <= VIEW_LIMIT);

                if(shouldSelect){
                    const checkbox = row.querySelector('label.core-checkbox input[type="checkbox"]');
                    if(checkbox && !checkbox.checked){
                        checkbox.click();
                        pageDeleteCount++;
                        totalDeleted++;
                        log(`✅ [总删${totalDeleted}] 选中: 销量${soldStr}, Views${viewsStr}`);
                    }
                } else {
                    // log(`➖ 不满足条件: 销量${soldStr}, Views${viewsStr}`);
                }
            }

            // 如果本页有选中的，执行删除流程 (完全保留原版操作)
            if(pageDeleteCount > 0){
                log(`本页勾选 ${pageDeleteCount} 个，准备删除...`);
                await new Promise(r=>setTimeout(r,3000));

                const dropdownBtn = document.querySelector("div.pulse-bulk-action-dropdown button");
                if(dropdownBtn){ dropdownBtn.click(); await new Promise(r=>setTimeout(r,800)); }

                // 精准定位“删除”选项
                const menuItems = Array.from(document.querySelectorAll('div.pulse-dropdown-menu-item, div.core-dropdown-menu-item'));
                const deleteItem = menuItems.find(el => {
                    const txt = el.textContent.trim();
                    return (txt === 'Delete' || txt.includes('Delete') && !txt.includes('Deactivate')) ||
                           txt === 'Hapus' ||
                           txt === '删除' ||
                           el.querySelector('svg.arco-icon-delete');
                });

                if(deleteItem){
                    deleteItem.click();
                    log('✅ 已点击 Delete（删除）菜单');
                    await new Promise(r=>setTimeout(r,1500));
                } else {
                    log('❌ 未找到删除选项，请检查菜单');
                }

                // 勾选所有平台
                const modalCheckboxes = document.querySelectorAll('div.core-modal-content label.core-checkbox input[type="checkbox"]');
                if(modalCheckboxes.length>0){
                    modalCheckboxes.forEach(cb=>{ if(!cb.checked) cb.click(); });
                    log(`✅ 已勾选所有平台`);
                    await new Promise(r=>setTimeout(r,800));
                }

                // 点击红色的 Konfirmasi / Confirm 按钮 (保留原版 Xpath)
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
                    log('🔴 已点击最终确认按钮');
                    await new Promise(r=>setTimeout(r,3000)); // 这里的等待稍微加长一点，防止下一页没刷出来
                } else {
                    log('⚠️ 没找到确认按钮');
                }

                log('等待 8 秒再翻页...');
                await new Promise(r=>setTimeout(r,8000));
            } else {
                log('👀 本页没有符合条件的商品');
            }

            // 检查是否全部完成
            if(totalDeleted >= MAX_DELETE){
                log(`🏁 已完成目标删除数量，脚本停止`);
                break;
            }

            // 翻页逻辑 (保留原版)
            const nextBtn = document.querySelector(".core-pagination-item-next:not(.core-pagination-item-disabled)");
            if(nextBtn){
                log('📄 翻下一页...');
                nextBtn.click();
                await new Promise(r=>setTimeout(r,10000));
            } else {
                log('🏁 没找到下一页按钮，任务结束');
                break;
            }
        }

        log(`🎉 脚本执行完毕，总共删除 ${totalDeleted} 个商品`);
    });
})();
