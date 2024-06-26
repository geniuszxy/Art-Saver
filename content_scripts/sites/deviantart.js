//---------------------------------------------------------------------------------------------------------------------
// page and user information
//---------------------------------------------------------------------------------------------------------------------

function getPageInfo() {
	let page = {
		url: window.location.href,
		site: 'deviantart'
	};

	let path = new URL(page.url).pathname;

	let reg = /^\/([^\/]+)(?:\/([^\/]+))?/.exec(path);
	if (reg) {
		if (['daily-deviations', 'watch'].includes(reg[1])) {
			page.page = reg[1];
		}
		else if (!reg[2] && $('title').textContent.endsWith(' | DeviantArt')) {
			page.page = 'user';
		}
		else if (reg[2]) {
			page.page = reg[2];
		}
	}
	//group pages that still have the old site layout
	let group = $('#group');
	if (group) {
		page.page = 'group';
	}

	if (['art'].includes(page.page)) {
		page.user = $(`a.user-link[href*="/${path.split('/')[1]}/"]`).getAttribute('data-username');
	}
	if (['journal'].includes(page.page)) {
		page.user = /by\ ([^\ ]+)\ on\ DeviantArt$/.exec($('title').textContent)[1];
	}
	else if (['about', 'user', 'gallery', 'prints', 'favourites', 'posts', 'shop', 'subscriptions'].includes(page.page)) {
		page.user = $('#content-container [data-username]').getAttribute('data-username');
	}

	return page;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function getUserInfo(user_id) {
	const params = new URLSearchParams({
		username: user_id,
		csrf_token: window.wrappedJSObject?.__CSRF_TOKEN__
	})
	let userresponse = await fetcher(`https://www.deviantart.com/_puppy/dauserprofile/init/about?${params}`);

	let user = {
		site: 'deviantart',
		id: user_id,
		name: user_id
	}

	if (userresponse.ok) {
		let userstats = await userresponse.json();

		user.icon = userstats.owner.usericon;

		let us = userstats.pageExtraData.stats;
		user.stats = new Map([
			['Deviations', us.deviations],
			['Favourites', us.favourites],
			['Views', us.pageviews]
		]);
	}
	else {
		user.icon = $(`img[title=${user.name}], img[alt="${user.name}'s avatar"]`).src;
		user.stats = new Map([]);
	}

	user.folderMeta = {
		site: user.site,
		userName: user.name
	};

	return user;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function userHomeLink(userName) {
	return `https://www.deviantart.com/${userName}`;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function userGalleryLink(userName) {
	return `https://www.deviantart.com/${userName}/gallery/all`;
}

//---------------------------------------------------------------------------------------------------------------------
// main add checks and download buttons to image thumbnails
//---------------------------------------------------------------------------------------------------------------------

function startChecking() {
	asLog('Checking DeviantArt');
	let page = getPageInfo();
	checkPage(page);

	let thumbselect = '.thumb, a[href*="/art/"]';

	let pageobserver = new MutationObserver((mutationsList, observer) => {
		let diffpage = false;
		let newnodes = mutationsList.flatMap(m => [...m.addedNodes]);

		if (page.url !== window.location.href || newnodes.some(n => $('title').contains(n))) {
			diffpage = true;
			page = getPageInfo();
		}

		if (page.page === 'art' && diffpage) {
			let submission = $('header + div > div > div > div > div');
			$$(submission, '[data-checkstatus]').forEach(e => e.removeAttribute('data-checkstatus'));
			$$(submission, '[class^=artsaver]:not(.artsaver-holder)').forEach(e => $remove(e));

			checkPage(page);
		}
		else if (newnodes.some(n => n.nodeType === 1 && (n.matches(thumbselect) || $(n, thumbselect)))) {
			checkPage(page);
		}
	});

	globalrunningobservers.push(pageobserver);
	pageobserver.observe(document, { childList: true, subtree: true });
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function checkPage(page) {
	//old thumbnails still show in art groups
	checkOldThumbnails(getOldThumbnails());

	checkThumbnails(getThumbnails());

	if (page.page === 'art') {
		checkSubmission(page.user, page.url);
	}
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
//Legacy

function getOldThumbnails() {
	let thumbnails = [];

	for (let thumb of $$('.thumb, .embedded-image-deviation')) {
		//----------------------------------------------
		//current unsupported thumbs
		//                 journals,  gallery folder preview images
		if (thumb.matches('.freeform:not(.literature), div.stream.col-thumbs *')) {
			continue;
		}
		//----------------------------------------------
		//devations in 'more from <user>/deviantart' or in '<user> added to this collection'
		if (thumb.matches('.tt-crop, #gmi-ResourceStream > *')) {
			thumb.style.position = 'relative';
		}
		//devations in texts
		else if (thumb.matches('.shadow > *:not(.lit)')) {
			thumb.style.position = 'relative';
			thumb.style.display = 'inline-block';
			let img = $(thumb, ':scope > img');
			if (img) {
				img.style.display = 'block';
			}
		}

		thumbnails.push(thumb);
	}

	return thumbnails;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function checkOldThumbnails(thumbnails) {
	for (let thumb of thumbnails) {
		try {
			let url = thumb.getAttribute('href') || $(thumb, 'a').href;
			if (/https?:\/\/sta\.sh/.test(url)) { //currently unable to directly download stash links
				continue;
			}
			let subid = parseInt(url.split('-').pop(), 10);
			let user = thumb.getAttribute('data-super-alt');
			let sub;
			if (thumb.matches('.lit')) {
				sub = $(thumb, 'span.wrap');
				user = '';
			}
			else if (thumb.matches('.literature')) {
				sub = $(thumb, 'a.torpedo-thumb-link');
				user = $(thumb, 'a.username').textContent;
			}
			else {
				sub = $(thumb, 'img');
				user = user ? user.split(' ').pop() : sub.alt.split(' ').pop();
			}

			addButton('deviantart', user, subid, sub.parentElement);
		}
		catch (err) { }
	}
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function getThumbnails() {
	let thumbnails = [];
	for (let thumb of $$('a[href*="/art/"]')) {
		if (
            !(
                thumb.parentElement?.querySelector('[data-testid="thumb"]') || // link contains/next to a thumbnail
				// old watch thumbnails are laid out next to link instead of inside
                thumb.matches('section + a[aria-label$=", literature"]') || // gallery literature thumbnails
                thumb.querySelector('section > h2') || // individual literature thumbnails
                (thumb.matches('.draft-thumb') && thumb.querySelector('img')) // thumbnails in literature
            )
        ) {
            continue;
        }
		//main gallery thumbnail
		if (thumb.matches('[data-hook=deviation_std_thumb] > a')) {
			thumb = thumb.parentElement;
		}
		//watch notification thumbnail
		if (thumb.matches('[class=""] > a')) {
			thumb = thumb.parentElement;
		}
		//literature thumbnail
		if (!$(thumb, 'img') && $(thumb, 'section')) {
			thumb.style.position = 'relative';
		}
		//popup thumbnails
		if (thumb.matches('[id^=popper] a')) {
			thumb.style.position = 'relative';
		}
		//thumbnails in comments
		if (thumb.matches('.draft-thumb > div > a')) {
			thumb.parentElement.parentElement.style.position = 'relative';
		}

		thumbnails.push(thumb);
	}
	return thumbnails;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function checkThumbnails(thumbnails) {
	for (let thumb of thumbnails) {
		try {
			let link = thumb.matches('a') ? thumb : thumb.querySelector('a');
			let subid = parseInt(link.href.split('-').pop(), 10);
			let user = '';
			let userlink = $(thumb, '.user-link');
			if (userlink) {
				user = userlink.getAttribute('data-username') ?? userlink.getAttribute('title');
			}
			if (!user) {
				//thumbs in the sidebar of a submission page
				let thumbtitle = thumb.getAttribute('title');
				if (thumbtitle) {
					titlereg = /\ by\ ([\w-]+)$/.exec(thumbtitle);
					if (titlereg) {
						user = titlereg[1];
					}
				}
			}
			if (!user) {
				//if no user element is found the thumbail may be part of a group
				//continue navigating up the element tree to try to find a user
				let element = thumb.parentElement;
				for (let i = 0; i < 5; i += 1) {
					userlink = $(element, '.user-link');
					if (userlink) {
						user = userlink.getAttribute('title');
						break;
					}
					else if (element.nodeName === 'SECTION') {
						break;
					}
					element = element.parentElement;
				}
			}
			let parent = navigateUpSmaller(link);
			parent.style.position = 'relative';

			addButton('deviantart', user, subid, parent);
		}
		catch (err) {}
	}
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function checkSubmission(user, url) {
	try {
		let subid = parseInt(url.split('-').pop(), 10);
		let stage = $('header + div > div > div > div > div');
		//art, pdf
		let submission = $(stage, 'img, [data-hook=react-playable], object[type="application/pdf"]');
		if (submission) {
			let parent = submission.parentElement
			parent.style.position = 'relative';
			addButton('deviantart', user, subid, parent, false);
			return;
		}
		//literature
		submission = $(stage, 'h1');
		if (submission) {
			let holder = $(stage, '.artsaver-holder')
			if (!holder) {
				holder = $insert(submission, 'div', { position: 'parent', class: 'artsaver-holder', style: 'margin:0;text-align:initial;' });
			}
			addButton('deviantart', user, subid, holder, false);
			return;
		}
	}
	catch (err) { }
}

//---------------------------------------------------------------------------------------------------------------------
// main download function
//---------------------------------------------------------------------------------------------------------------------
//submission - https://www.deviantart.com/_napi/shared_api/deviation/extended_fetch?deviationid=<sumbissionId>&username=<userName>&type=art&include_session=false
//user       - https://www.deviantart.com/_napi/da-user-profile/api/init/gallery?username=<userName>
//gallery    - https://www.deviantart.com/_napi/da-user-profile/api/gallery/contents?username=<userName>&offset=0&limit=24&all_folder=true&mode=newest //24 is max
//rss        - https://backend.deviantart.com/rss.xml?q=+sort:time+by:<userName>+-in:journals&type=deviation

async function startDownloading(subid, progress) {
	progress.say('Getting submission');
	let options = await getOptions('deviantart');
	let pageurl = `https://www.deviantart.com/deviation/${subid}`;

	try {
		let preresponse = await fetcher(pageurl, 'response');
		let username = preresponse.url.split('/')[3];
		let csrf_token = window.wrappedJSObject?.__CSRF_TOKEN__
		if (!csrf_token) {
			const page_text = await preresponse.text()
			csrf_token = /__CSRF_TOKEN__\s=\s'(.+?)'/.exec(page_text)?.[1]
		}
		let params = new URLSearchParams({
			deviationid: subid,
			username: username,
			type: 'art',
			include_session: false,
			csrf_token: csrf_token
		});
		let response = await fetcher(`https://www.deviantart.com/_puppy/dadeviation/init?${params}`, 'json');
		let { info, meta } = await getMeta(response, options, progress);

		let downloads = [{ url: info.downloadurl, meta, filename: options.file }];
		if (info.blob) {
			downloads[0].blob = info.blob;
		}
		if (info.filesize) {
			downloads[0].filesize = info.filesize;
		}

		if (options.stash && info.stash.length > 0) {
			progress.say('Found stash');
			let stashworker = new Worker(browser.runtime.getURL('/workers/stashworker.js'));

			let stashurls = await workerMessage(stashworker, 'getstashurls', info.stash);

			let count = 0;
			for (let stashurl of stashurls) {
				count += 1;
				progress.onOf('Getting stash', count, stashurls.length);

				let stashstring = await workerMessage(stashworker, 'fetchstash', stashurl);
				if (typeof (stashstring) === 'number') {
					//asLog(`%cError ${stashstring}:`, 'color: #d70022', stashurl);
					continue;
				}
				let regex_result = /window\.__INITIAL_STATE__\s=\sJSON\.parse\((".+")\);/.exec(stashstring);
				if (!regex_result) {
					throw new Error('Stash data not found in RegExp');
				}
				let data_string = regex_result[1].replaceAll("\\'", "'");
				let state_obj = JSON.parse(JSON.parse(data_string))['@@entities'];
				let sr = {
					deviation: Object.values(state_obj.deviation)[0],
					extended: Object.values(state_obj.deviationExtended)[0],
					user: Object.values(state_obj.user)[0],
				};

				let { stashinfo, stashmeta } = await getStashMeta(sr, { url: info.url, ...meta }, options, progress);
				if (Object.entries(stashmeta).length === 0) {
					continue;
				}

				let stashdownload = {
					url: stashinfo.downloadurl,
					meta: { ...meta, ...stashmeta },
					filename: options.stashFile
				};
				if (stashinfo.blob) {
					stashdownload.blob = stashinfo.blob;
				}

				downloads.push(stashdownload);
			}
			stashworker.terminate();
		}

		let results = await handleDownloads(downloads, options, progress);
		if (results.some(r => r.response === 'Success')) {
			progress.say('Updating');
			await updateSavedInfo(info.savedSite, info.savedUser, info.savedId);
		}
		else {
			throw new Error(results[0].message);
		}

		progress.finished();
		return {
			status: 'Success',
			submission: {
				url: pageurl,
				user: info.savedUser,
				id: info.savedId,
				title: downloads[0].meta.title
			},
			files: results
		};
	}
	catch (err) {
		asLog(err);
		progress.error();

		return {
			status: 'Failure',
			error: err,
			url: pageurl,
			progress
		};
	}
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function getMeta(r, options, progress) {
	r = r.deviation;
	progress.say('Getting meta');
	let info = {}, meta = {};
	meta.site = 'deviantart';
	meta.title = r.title;
	meta.userName = r.author.username;
	meta.submissionId = r.deviationId;
	meta.submissionId36 = r.deviationId.toString(36);
	meta = { ...meta, ...timeParse(r.publishedTime) };
	meta.fileName = r.media.prettyName || deviantArtFileName(r.title, r.author.username, r.deviationId);

	info.savedSite = meta.site;
	info.savedUser = meta.userName;
	info.savedId = meta.submissionId;

	info.url = r.url;

	//find stash in description
	let description = r.extended.descriptionText?.html?.markup ?? "";
	let matches = description.matchAll(/(https:\/\/(?:sta\.sh|www.deviantart.com\/stash)\/.+?)[\s'"]/g);
	info.stash = [...new Set([...matches].map((m) => m[1]))];

	if (r.isDownloadable) { //the user is cool; downloading full resolution is easy
		info.downloadurl = r.extended.download.url;
		info.filesize = r.extended.download.filesize;
	}
	else if (r.type === 'literature') {
		if (options.literature === 'html') {
			progress.say('Creating html');
			meta.ext = 'html';
			info.blob = await literatureToHtml(r, meta, options);
		}
		else { //options.literature === 'txt'
			progress.say('Creating txt');
			meta.ext = 'txt';
			info.blob = await literatureToText(r, meta, options);
		}
		return { info, meta };
	}
	else { //the user is uncool; downloading is hard and often full resolution is not available
		//Usually
		//type.c = image
		//type.s = swf
		//type.b = mp4, gif
		let types = r.media.types;
		//sort by resolution
		let compare_value = (t) => t.w * t.h + ((t.t === 'fullview') ? 1 : 0);
		types.sort((a, b) => compare_value(b) - compare_value(a));
		//sort by file size
		//it is possible for no types to have a file size
		//this assumes a larger file size is a better quality file
		types.sort((a, b) => (b.f ?? 0) - (a.f ?? 0));
		let type = types[0];

		let url = (type.t === 'fullview') ? (type.c ? `${r.media.baseUri}${type.c}` : r.media.baseUri) : (type.s ?? type.b);

		if (r.media.prettyName) {
			url = url.replace(/<prettyName>/g, r.media.prettyName);
		}
		if (r.media.token) {
			url = `${url}?token=${r.media.token[0]}`;
		}
		//Make sure quailty is 100
		//Replacing .jpg with .png can lead to better quailty
		if (/\/v1\/fill\//.test(url)) {
			url = url.replace(/q_\d+/, 'q_100').replace('.jpg?', '.png?');
		}
		//flash with no download button
		if (/\/\/sandbox/.test(url)) {
			let embedded = await fetcher(url, 'document');
			url = $(embedded, '#sandboxembed').src;
		}

		info.downloadurl = url;
	}

	if (r.type === 'pdf') {
		meta.ext = 'pdf';
		return { info, meta };
	}

	//example download urls
	//https://www.deviantart.com/download/123456789/d21i3v9-3885adbb-f9f1-4fbe-8d2d-98c4578ba244.ext?token=...&ts=1234567890
	//https://images-wixmp-ed30a86b8c4ca887773594c2.wixmp.com/f/2f9bc7a0-1a23-4a7e-ad00-07e8ffd4105d/d21i3v9-3885adbb-f9f1-4fbe-8d2d-98c4578ba244.ext/v1/fill/w_1280,h_720,q_100,strp/title_by_username_d21i3v9-fullview.ext?token=...

	let reg = /\/[^\/?]+\.(\w+)(?:\?token=.+)?$/;
	meta.ext = reg.exec(info.downloadurl)[1];

	if (info.downloadurl.search('/v1/fill/') < 0 || !options.larger) {
		return { info, meta };
	}
	progress.say('Comparing images');
	info.downloadurl = await compareUrls(info.downloadurl, options);
	//update extension in case it is different
	meta.ext = reg.exec(info.downloadurl)[1];
	return { info, meta };
}

async function getStashMeta(sr, meta, options, progress) {
	let stashinfo = {}, stashmeta = {};
	stashmeta.stashSubmissionId = sr.deviation.deviationId;
	stashmeta.stashTitle = sr.deviation.title ?? '';
	stashmeta.stashUserName = sr.user.username;
	stashmeta.stashUrlId = sr.deviation.url.split('/0').pop();
	
	let parsed_time = timeParse(sr.deviation.publishedTime);
	stashmeta.stashYYYY = parsed_time.YYYY;
	stashmeta.stashMM = parsed_time.MM;
	stashmeta.stashDD = parsed_time.DD;
	stashmeta.stashhh = parsed_time.hh;
	stashmeta.stashmm = parsed_time.mm;
	stashmeta.stashss = parsed_time.ss;

	let sid = parseInt(stashmeta.stashSubmissionId, 10);
	stashmeta.stashFileName = deviantArtFileName(stashmeta.stashTitle, stashmeta.stashUserName, sid);
	//literature
	if (sr.deviation.type === 'literature') {
		if (options.literature === 'html') {
			progress.say('Creating html');
			stashmeta.stashExt = 'html';
			stashinfo.blob = await stashLiteratureToHtml(sr, { ...meta, ...stashmeta }, options);
		}
		else { //options.literature === 'txt'
			progress.say('Creating txt');
			stashmeta.stashExt = 'txt';
			stashinfo.blob = await stashLiteratureToText(sr, { ...meta, ...stashmeta }, options);
		}
		return { stashinfo, stashmeta };
	}

	stashinfo.downloadurl = sr.extended.download.url;
	stashmeta.stashExt = sr.extended.download.type?.toLowerCase() ?? '';

	return { stashinfo, stashmeta };
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function handleDownloads(downloads, options, progress) {
	if (options.moveFile && downloads.length > 1) {
		let stashfolder = /.*\//.exec(options.stashFile);
		let newf = options.file.split('/').pop();
		if (stashfolder) {
			newf = stashfolder[0] + newf;
		}
		downloads[0].filename = newf;
		downloads[0].meta = downloads[1].meta;
	}

	progress.start('Starting download');

	let bytes = 0;
	let total = downloads.length;
	let results = [];

	let blob;
	if (downloads[0].blob) {
		blob = downloads[0].blob;
		progress.blobProgress(0, total, bytes, blob.size, blob.size);
	}
	else {
		blob = await fetchBlob(downloads[0].url, (loaded, blobtotal) => {
			progress.blobProgress(0, total, bytes, loaded, blobtotal || downloads[0].filesize);
		});
	}
	bytes += blob.size;

	let result = await downloadBlob(blob, downloads[0].filename, downloads[0].meta);
	results.push(result);

	if (total <= 1) {
		return results;
	}
	let downloadworker = new Worker(browser.runtime.getURL('/workers/downloadworker.js'));

	//assuming all downloads after the first one are stash downloads
	for (let i = 1; i < total; i += 1) {
		let stashblob;
		if (downloads[i].blob) {
			stashblob = downloads[i].blob;
			progress.blobProgress(i, total, bytes, blob.size, blob.size);
		}
		else {
			stashblob = await workerMessage(downloadworker, 'downloadblob', downloads[i].url, (data) => {
				progress.blobProgress(i, total, bytes, data.loaded, data.total);
			});
		}
		bytes += stashblob.size;

		let result = await downloadBlob(stashblob, downloads[i].filename, downloads[i].meta);
		results.push(result);
	}
	downloadworker.terminate();

	return results;
}

//---------------------------------------------------------------------------------------------------------------------
// download helper functions
//---------------------------------------------------------------------------------------------------------------------

async function compareUrls(url, options) {
	//old larger url link
	//downloadurl = `https://${u[2]}/intermediary/f/${u[4]}/${u[5]}/v1/fill/w_5100,h_5100,q_100,bl/${u[9].split('?token=')[0]}`;
	//possible new larger link
	let u = url.split('/');
	let newurl = `https://${u[2]}/intermediary/f/${u[4]}/${u[5]}`;

	let new_image = await getImage(newurl);
	if (new_image.resolution === 0) {
		return url
	}
	let original_image = await getImage(url);
	if (original_image.resolution < new_image.resolution) {
		return  newurl;
	}
	return url;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function getImage(imgsrc) {
	let result = await Promise.all([imgSize(imgsrc), imgDim(imgsrc)]);
	return {
		url: imgsrc,
		filesize: result[0],
		resolution: result[1]
	};

	async function imgSize(src) {
		let imgres = await fetcher(src);
		return (imgres.ok) ? parseInt(imgres.headers.get('content-length'), 10) : 0;
	}

	function imgDim(src) {
		return new Promise((resolve, reject) => {
			let img = new Image;
			img.onload = function () { resolve(this.width * this.height); };
			img.onerror = () => resolve(0);
			img.src = src;
		});
	}
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function deviantArtFileName(title, user, subid) {
	let id36 = subid.toString(36);
	let titlelower = title.replace(/[\s\W]/g, '_').toLowerCase();
	let userlower = user.toLowerCase();
	return `${titlelower}_by_${userlower}_d${id36}`;
}

//---------------------------------------------------------------------------------------------------------------------
// literature conversion
//---------------------------------------------------------------------------------------------------------------------
// to html

async function literatureToHtml(r, meta, options) {
	let page = await fetcher(r.url, 'document');

	let storyelem = $(page, 'section .da-editor-journal > div > div > div, section > div > .legacy-journal') || $create('div');
	let story = cleanContent(storyelem);
	story.firstElementChild.id = 'content';

	let words = getElementText(story.cloneNode(true)).replace(/[^\w\s]+/g, '').match(/\w+/g).length;

	if (options.includeImage) {
		let iconurl = await getImageIcon(meta.submissionId);
		if (iconurl && !story.innerHTML.includes(iconurl)) {
			$insert($insert(story, 'div', { position: 'afterbegin', id: 'image' }), 'img', { src: iconurl });
		}
	}

	let descelem = $(page, '[role=complementary] + div .legacy-journal') || $create('div');
	let description = cleanContent(descelem);
	description.firstElementChild.id = 'description';

	//make sure images in the story are all full quality
	story = await upgradeContentImages(story, options.embedImages);
	description = await upgradeContentImages(description, options.embedImages);

	let storymeta = {
		story: story.innerHTML,
		description: description.innerHTML,
		wordCount: words,
		url: r.url,
		...meta
	}

	let html = options.literatureHTML;
	for (let [key, value] of Object.entries(storymeta)) {
		html = html.replace(RegExp(`{${key}}`, 'g'), `${value}`);
	}

	return new Blob([html], { type: 'text/html' });
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function stashLiteratureToHtml(sr, meta, options) {
	let page = await fetcher(sr.deviation.url, 'document');

	let storyelem = $(page, 'section .da-editor-journal > div > div > div, section > div > .legacy-journal') || $create('div');
	let story = cleanContent(storyelem);
	story.firstElementChild.id = 'content';

	let words = getElementText(story.cloneNode(true)).replace(/[^\w\s]+/g, '').match(/\w+/g).length;

	let descelem = $(page, '[role=complementary] + div .legacy-journal') || $create('div');
	let description = cleanContent(descelem);
	description.firstElementChild.id = 'description';

	//make sure images in the story are all full quality
	story = await upgradeContentImages(story, options.embedImages);
	description = await upgradeContentImages(description, options.embedImages);

	let storymeta = {
		story: story.innerHTML,
		stashDescription: description.innerHTML,
		wordCount: words,
		stashUrl: sr.deviation.url,
		...meta
	}

	let html = options.stashLiteratureHTML;
	for (let [key, value] of Object.entries(storymeta)) {
		html = html.replace(RegExp(`{${key}}`, 'g'), `${value}`);
	}

	return new Blob([html], { type: 'text/html' });
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function getImageIcon(submissionId) {
	let params = new URLSearchParams({
		url: `https://www.deviantart.com/deviation/${submissionId}`,
		format: 'json'
	});
	let back = await fetcher(`https://backend.deviantart.com/oembed?${params}`, 'json');
	return back.fullsize_url;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function cleanContent(element) {
	//simplify thumbnail journal links
	$$(element, 'a.lit').forEach(l => l.textContent = l.href);

	element = DOMPurify.sanitize(element, {
		IN_PLACE: true,
		FORBID_TAGS: ['style'],
		FORBID_ATTR: ['id', 'class', 'style', 'srcset'],
		ALLOW_DATA_ATTR: false
	});

	//remove unecessary div and span elements
	for (let elem of $$(element, 'div, span')) {
		if (elem.attributes.length <= 0) {
			while (elem.firstChild) {
				elem.parentElement.insertBefore(elem.firstChild, elem);
			}
			$remove(elem);
		}
	}
	//deviant art treats paragraphs like line breaks
	//combine paragraphs
	if (element.matches('.da-editor-journal div') && element.firstChild) {
		let child = element.firstChild;
		while (child.nextSibling) {
			let next = child.nextSibling;
			if (child.nodeName === 'P' && next.nodeName === 'P') {
				child.append($create('br'), ...next.childNodes);
				$remove(next);
			}
			else {
				child = child.nextSibling;
			}
		}
	}
	//remove double spacing
	for (let elem of $$(element, 'p + br + p, p + br + br')) {
		$remove(elem.previousElementSibling);
	}

	let content = $create('div');
	let wrap = $insert(content, 'section');
	wrap.append(...element.childNodes);
	return content;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function upgradeContentImages(content, embed) {
	for (let img of $$(content, 'img')) {
		let url = img.src;
		let reg = /.+\w{12}\.\w+/.exec(url);
		if (/token=/.test(url)) {
			url = url.replace(/q_\d+/, 'q_100').replace('.jpg?', '.png?');
		}
		else if (reg) {
			url = reg[0];
		}
		//convert images to data urls
		img.src = (embed) ? await urlToDataUrl(url) : url;
	}

	return content;
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function urlToDataUrl(url) {
	let blob = await fetcher(url, 'blob');
	return await new Promise((resolve, reject) => {
		let fr = new FileReader();
		fr.onload = data => resolve(data.target.result);
		fr.readAsDataURL(blob);
	});
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
// to txt

async function literatureToText(r, meta, options) {
	let page = await fetcher(r.url, 'document');
	let storyelem = $(page, 'section .da-editor-journal > div > div > div, section > div > .legacy-journal') || $create('div');
	let story = getElementText(storyelem);

	let words = story.replace(/[^\w\s]+/g, '').match(/\w+/g).length;

	let descelem = $(page, '[role=complementary] + div .legacy-journal') || $create('div');
	let description = getElementText(descelem);

	let storymeta = {
		story: story,
		description: description,
		wordCount: words,
		url: r.url,
		...meta
	}

	let text = options.literatureText;
	for (let [key, value] of Object.entries(storymeta)) {
		text = text.replace(RegExp(`{${key}}`, 'g'), `${value}`);
	}

	return new Blob([text], { type: 'text/txt' });
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

async function stashLiteratureToText(sr, meta, options) {
	let page = await fetcher(sr.deviation.url, 'document');
	let storyelem = $(page, 'section .da-editor-journal > div > div > div, section > div > .legacy-journal') || $create('div');
	let story = getElementText(storyelem);

	let words = story.replace(/[^\w\s]+/g, '').match(/\w+/g).length;

	let descelem = $(page, '[role=complementary] + div .legacy-journal') || $create('div');
	let description = getElementText(descelem);

	let storymeta = {
		story: story,
		stashDescription: description,
		wordCount: words,
		stashUrl: sr.deviation.url,
		...meta
	}

	let text = options.stashLiteratureText;
	for (let [key, value] of Object.entries(storymeta)) {
		text = text.replace(RegExp(`{${key}}`, 'g'), `${value}`);
	}

	return new Blob([text], { type: 'text/txt' });
}

//- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

function getElementText(elem) {
	elem = cleanContent(elem);
	$$(elem, 'li').forEach(li => li.insertAdjacentText('afterbegin', '  ●  '));
	for (let a of $$(elem, 'a')) {
		a.href = a.href.replace(/https?:\/\/www\.deviantart\.com\/users\/outgoing\?/g, '');
		a.textContent = a.href;
	}

	let renderer = $insert(document.body, 'div', { class: 'artsaver-text-render' });
	renderer.append(...elem.childNodes);

	let text = renderer.innerText;
	//fix for lists
	text = text.replace(/  ●  \n\n/g, '  ●  ');
	$remove(renderer);

	return text;
}