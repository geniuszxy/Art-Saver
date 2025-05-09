"use strict";
//---------------------------------------------------------------------------------------------------------------------
// page and user information
//---------------------------------------------------------------------------------------------------------------------
var G_site_info = pixiv_info;
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
var getPageInfo = async function () {
    const url = window.location.href;
    let page = pixiv_info.site;
    let has_user = false;
    let user;
    const regex_result = /(?:\/en)?\/(\w+)\/(\d+)?/.exec(url);
    if (regex_result) {
        page = regex_result[1];
        if (page === 'users') {
            has_user = true;
            user = regex_result[2];
        }
        else if (['artworks', 'novel'].includes(page)) {
            has_user = true;
            const user_link = await pollElement(document, 'h2 a[href*="/users/"]');
            user = /\/(\d+)/.exec(user_link?.href)?.[1];
        }
    }
    if (has_user && typeof user === 'undefined') {
        throw new Error(`User not found for page '${page}'`);
    }
    const info = { site: pixiv_info.site, url, page, user };
    return info;
};
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
var getUserInfo = async function (user) {
    const init = {
        credentials: 'include',
        referrer: window.location.href,
    };
    const responses = await Promise.all([
        fetchOk(`https://www.pixiv.net/ajax/user/${user}`, init),
        fetchOk(`https://www.pixiv.net/touch/ajax/user/home?id=${user}`, init),
        fetchOk(`https://www.pixiv.net/ajax/user/${user}/illusts/bookmarks?tag=&offset=0&limit=1&rest=show`, init),
    ]);
    const [user_data, home_data, bookmarks_data] = await Promise.all([
        responses[0].json(),
        responses[1].json(),
        responses[2].json(),
    ]);
    const name = user_data.body.name;
    const icon_url = user_data.body.imageBig;
    const icon_response = await fetchWorkerOk(icon_url, init);
    const icon = await browser.runtime.sendMessage({
        action: 'background_create_object_url',
        blob: icon_response.body,
    });
    const stats = new Map();
    stats.set('Submissions', home_data.body.work_sets.all.total);
    stats.set('Bookmarks', bookmarks_data.body.total);
    const folder_meta = {
        site: pixiv_info.site,
        userId: user,
        userName: name,
    };
    const options = await getOptionsStorage(pixiv_info.site);
    const info = {
        site: pixiv_info.site,
        user,
        name,
        icon,
        stats,
        folder: renderPath(options.userFolder, folder_meta),
    };
    return info;
};
//---------------------------------------------------------------------------------------------------------------------
// main add checks and download buttons to image thumbnails
//---------------------------------------------------------------------------------------------------------------------
var startChecking = async function () {
    const throttler = new FunctionThrottler(checkPixiv);
    const observer = new MutationObserver(() => {
        throttler.run();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    throttler.run();
};
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function checkPixiv() {
    const page = await getPageInfo();
    if (page.page === 'artworks' && page.user) {
        checkPixivSubmissionPage(page.url, page.user);
    }
    checkPixivPage(page.user);
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function checkPixivPage(page_user) {
    for (const img of document.querySelectorAll('a[href*="/artworks/"] img')) {
        let thumb = img.parentElement;
        // try to get the highest element that relates to a single submission
        while (true) {
            const parent = thumb?.parentElement;
            const has_one_img = parent?.querySelectorAll('a[href*="/artworks/"] img').length === 1;
            const is_list_element = ['UL', 'NAV'].includes(parent?.nodeName ?? '');
            if (has_one_img && !is_list_element) {
                thumb = parent;
            }
            else {
                break;
            }
        }
        if (thumb) {
            checkPixivThumbnail(thumb, page_user);
        }
    }
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function checkPixivThumbnail(element, page_user) {
    const link = element.querySelector('a[href*="/artworks/"]');
    if (!link) {
        G_check_log.log('Link not found for', element);
        return;
    }
    const submission_id = /\/(\d+)$/.exec(link.href)?.[1];
    if (!submission_id) {
        G_check_log.log('Submission not found for', element);
        return;
    }
    const submission = parseInt(submission_id, 10);
    let user_link;
    for (let i = 0; i < 10; i++) {
        // requested illustration boxes show requester before artist
        user_link = [...element.querySelectorAll('a[href*="/users/"]')].pop();
        // if no user element is found the thumbail may be part of a group
        // continue navigating up the element tree to try to find a user
        const next_element = element.parentElement;
        if (user_link || element.nodeName === 'SECTION' || !next_element) {
            break;
        }
        else {
            element = next_element;
        }
    }
    const user = /\/(\d+)/.exec(user_link?.href ?? '')?.[1] ?? page_user;
    if (!user) {
        G_check_log.log('User not found for', element);
        return;
    }
    const parent = navigateUpSmaller(link);
    const info = { site: pixiv_info.site, user, submission };
    return createButton(info, parent);
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function checkPixivSubmissionPage(url, user) {
    const figure = document.querySelector('figure > [role=presentation]')?.parentElement;
    if (!figure) {
        return;
    }
    const submission_id = /\/(\d+)$/.exec(url)?.[1];
    if (!submission_id) {
        return;
    }
    const info = {
        site: pixiv_info.site,
        user,
        submission: parseInt(submission_id, 10),
    };
    createButton(info, figure);
}
//---------------------------------------------------------------------------------------------------------------------
// main download function
//---------------------------------------------------------------------------------------------------------------------
var startDownloading = async function (submission, progress) {
    const options = await getOptionsStorage(pixiv_info.site);
    const init = {
        credentials: 'include',
        referrer: window.location.href,
    };
    const response = await fetchOk(`https://www.pixiv.net/ajax/illust/${submission}`, init);
    const obj = await response.json();
    const { info, meta } = getPixivSubmissionData(submission, obj);
    const file_datas = await getPixivFileDatas(obj, meta, options, progress);
    const downloads = createPixivDownloads(meta, file_datas, options);
    return await downloadSubmission(info, downloads, init, progress, meta.title);
};
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function getPixivSubmissionData(submission, obj) {
    const user_name = obj.body.userName;
    const user_id = obj.body.userId;
    const title = obj.body.title;
    const date_time = timeParse(obj.body.uploadDate);
    const meta = {
        site: pixiv_info.site,
        userId: user_id,
        userName: user_name,
        submissionId: `${submission}`,
        title,
        ...date_time,
    };
    const info = {
        site: pixiv_info.site,
        user: user_id,
        submission,
    };
    return { info, meta };
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function getPixivFileDatas(obj, submission_meta, options, progress) {
    const url = obj.body.urls.original;
    // example urls
    // https://i.pximg.net/img-original/img/2020/01/23/45/67/89/123456789_p0.jpg
    const regex_result = /(.+\/)(([^\/]+)0)(\.(\w+))$/.exec(url);
    if (!regex_result) {
        throw new Error('Download link does not match RegExp');
    }
    let pages = obj.body.pageCount;
    const is_ugoira = obj.body.illustType === 2;
    if (is_ugoira) {
        progress.message('Getting ugoira meta');
        const init = {
            credentials: 'include',
            referrer: window.location.href,
        };
        const response = await fetchOk(`https://www.pixiv.net/ajax/illust/${submission_meta.submissionId}/ugoira_meta`, init);
        const ugoira_obj = await response.json();
        pages = ugoira_obj.body.frames.length;
        if (options.ugoira !== 'multiple') {
            const frames = [];
            for (let i = 0; i < pages; i++) {
                frames.push(`${regex_result[1]}${regex_result[3]}${i}${regex_result[4]}`);
            }
            const width = obj.body.width;
            const height = obj.body.height;
            const delays = ugoira_obj.body.frames.map((f) => f.delay);
            const blob = await getUgoira(options.ugoira, frames, width, height, delays, progress);
            const meta = {
                fileName: regex_result[2],
                ext: options.ugoira.replace('apng', 'png'),
            };
            const info = {
                download: blob,
            };
            return [{ info, meta }];
        }
    }
    const files = [];
    for (let i = 0; i < pages; i++) {
        const file_name = `${regex_result[3]}${i}`;
        const meta = {
            fileName: file_name,
            ext: regex_result[5],
        };
        const info = {
            download: `${regex_result[1]}${file_name}${regex_result[4]}`,
        };
        files.push({ info, meta });
    }
    return files;
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
function createPixivDownloads(submission_meta, file_datas, options) {
    const downloads = [];
    if (file_datas.length > 1) {
        for (const [i, file] of enumerate(file_datas)) {
            const meta = {
                ...submission_meta,
                ...file.meta,
                page: `${i + 1}`,
            };
            downloads.push({
                ...file.info,
                path: renderPath(options.multiple, meta),
            });
        }
    }
    else {
        const meta = {
            ...submission_meta,
            ...file_datas[0].meta,
        };
        downloads.push({
            ...file_datas[0].info,
            path: renderPath(options.file, meta),
        });
    }
    return downloads;
}
//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
async function getUgoira(type, frames, width, height, delays, progress) {
    progress.start('Getting ugoira frames');
    let bytes = 0;
    const total = frames.length;
    const blobs = [];
    const init = {
        credentials: 'include',
        referrer: window.location.href,
    };
    const fetch_worker = new FetchWorker();
    for (const [i, frame] of enumerate(frames)) {
        const response = await fetch_worker.fetchOk(frame, init, (loaded, blob_total) => {
            progress.blobMessage(i, total, bytes, loaded, blob_total);
        });
        bytes += response.body.size;
        blobs.push(response.body);
    }
    fetch_worker.terminate();
    progress.width(100);
    progress.message(`Creating ${type.toUpperCase()}`);
    const ugoira_worker = new Worker(browser.runtime.getURL('/workers/ugoira_worker.js'));
    const ugoira_promise = new Promise((resolve, reject) => {
        ugoira_worker.onmessage = (message) => {
            switch (message.data.message) {
                case 'result':
                    resolve(message.data.result);
                    break;
                case 'error':
                    reject(message.data.error);
                    break;
            }
        };
    });
    const ext = frames[0].split('.').pop() ?? '';
    ugoira_worker.postMessage({ type, blobs, width, height, delays, ext });
    const urgoira_blob = await ugoira_promise;
    ugoira_worker.terminate();
    return urgoira_blob;
}
