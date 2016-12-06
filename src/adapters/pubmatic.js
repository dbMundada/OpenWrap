adapterManagerRegisterAdapter((function(){	

	win.bidDetailsMap = win.bidDetailsMap || {};
	win.progKeyValueMap = win.progKeyValueMap || {};
		
	var adapterID = 'pubmatic',

		constConfigPubID = 'pub_id',
		constPubId = 'pubId',
		constPubMaticResponseCreative = 'creative_tag',
		constPubMaticResponseTrackingURL = 'tracking_url',
		adapterConfigMandatoryParams = [constConfigPubID, constConfigKeyGeneratigPattern, constConfigServerSideKey],
		slotConfigMandatoryParams = [],

		pubID = 0,
		wrapperImpressionID = '',
		conf = {},
		pmSlotToDivIDMap = {},

		isPixelingDone = false,

		ortbEnabledPublishers = {5890:''},

		setTimeStampAndZone = function(conf) {
			var currTime = new Date();
			conf.kltstamp  = currTime.getFullYear()
								+ "-" + (currTime.getMonth() + 1)
								+ "-" + currTime.getDate()
								+ " " + currTime.getHours()
								+ ":" + currTime.getMinutes()
								+ ":" + currTime.getSeconds();
			conf.timezone = currTime.getTimezoneOffset()/60  * -1;
		},

		initiateUserSyncup = function(){
			if( ! isPixelingDone ){
				setTimeout(function(){
					var element = doc.createElement('iframe');
					element.src = utilMetaInfo.protocol + 'ads.pubmatic.com/AdServer/js/showad.js#PIX&kdntuid=1&p=' + pubID + '&s=&a=';
					element.style.height ="0px";
					element.style.width ="0px";
					doc.getElementsByTagName("script")[0].parentNode.appendChild(element);
					isPixelingDone = true;
				}, 2000);				
			}
		},

		initConf = function(){
			conf[constPubId] = pubID;
			conf['wiid'] = wrapperImpressionID;
			//conf.pm_cb = 'DM.callBack';
			conf.pm_cb = 'window.PWT.PubmaticAdapterCallback';
			conf.grs = 3; // Grouped Response parameter, 0: default, 1: variables are split, 2: 1+rid passed to cback func, 3: 1+ md5 of bidid
			conf.a = 1;// async == true
			conf.pageURL  = utilMetaInfo.u;				
			conf.refurl   = utilMetaInfo.r;			
			conf.inIframe = win != top ? '1' : '0';
			conf.screenResolution =  win.screen.width + 'x' + win.screen.height;
			conf.ranreq = Math.random();

			conf.profId = bidManagerGetProfileID();
			if(utilUsingDifferentProfileVersionID){
				conf.verId = bidManagerGetProfileDisplayVersionID();
			}
			
			if(navigator.cookieEnabled === false ){
				conf.fpcd = '1';
			}
			setTimeStampAndZone( conf );
		},		

		createOrtbJson = function(conf, slots, keyGenerationPattern){
			var json = {},
				loc = win.location,
				nav = win.navigator,
				passTheseConfParamsIntoDmExtension = ['a', 'pm_cb', 'pubId', 'ctype', 'kval_param', 'lmk', 'profId', 'verId'],
				copyFromConfAndDeleteFromConf = function(conf, key, dmExtension){
					if(conf[key]){
						dmExtension[key] = decodeURIComponent(conf[key]);
						delete conf[key];
					}
				}
			;

			delete conf.grs;

			// setting up the schema
			json = {
				id : ''+utilGetCurrentTimestampInMs(),
				at: 2,
				cur: ["USD"],
				imp: [],
				site: {
					domain: loc.hostname,
					page: loc.href,
					publisher: {
						id: ''+pubID
					}
				},
				device: {
					ua: nav.userAgent
				},
				ext: {
					extension: {}
				}
			};

			// adding slots info
			for(var i= 0, l = slots.length; i < l; i++){
				var slot = slots[i];							

				var format = [];
				for(var k=0, kl = slot[constAdSlotSizes].length; k<kl; k++){
					var width = slot[constAdSlotSizes][k][0];
					var height = slot[constAdSlotSizes][k][1];
					format.push({
						w: width,
						h: height
					});

					// note: this part is hard-coded
					// expects that key will always be _AU_@_W_x_H_:_AUI_
					pmSlotToDivIDMap[ slot['adUnitID'] + '@' + width + 'x' + height + ':' + slot['adUnitIndex']] = slot[constCommonDivID];
				}

				var anImp = {
					id: json.id + '_' + i,
					banner: {
						pos: 0,
						format: format
					},
					ext: {
						extension: {
							div: slot[constCommonDivID],
							adunit: slot['adUnitID'],
							slotIndex: slot['adUnitIndex'],
							"keyValue": slot[constCommonSlotKeyValue]
						}
					}
				};

				json.imp.push(anImp);
			}

			//if there are no json.imp then return undefined
			if(json.imp.length == 0){
				return undefined;
			}

			// DM specific params
			var dmExtension = {
				rs: 1//todo confirm
			};
			
			for(var i=0, l = passTheseConfParamsIntoDmExtension.length; i < l; i++){
				copyFromConfAndDeleteFromConf(conf, passTheseConfParamsIntoDmExtension[i], dmExtension);
			}			
			json.ext.extension['dm'] = dmExtension;

			// AdServer specific params to be passed, as it is
			json.ext.extension['as'] = conf;

			return json;
		},

		makeOrtbCall = function(slots, keyGenerationPattern){
			var request_url = utilMetaInfo.protocol + 'hb.pubmatic.com/openrtb/24/?',
				json = createOrtbJson(conf, slots, keyGenerationPattern)
			;
			if(json == undefined){
				return;
			}
			request_url += 'json='+encodeURIComponent(JSON.stringify(json));
			utilLoadScript(request_url);
		},
		
		createLegacyCall = function(activeSlots, keyGenerationPattern){
		
			var request_url = "",
				tempURL,
				protocol = utilMetaInfo.protocol,
				adserver_url = 'haso.pubmatic.com/ads/',
				slots = [],
				conf = {},
				lessOneHopPubList = {46076:'', 60530:'', 9999:'', 7777:''}
			;

			utilForEachGeneratedKey(
				adapterID,
				slotConfigMandatoryParams,
				activeSlots, 
				keyGenerationPattern, 
				false, 
				function(generatedKey, kgpConsistsWidthAndHeight, currentSlot, keyConfig, currentWidth, currentHeight){
					slots.push( generatedKey );
					pmSlotToDivIDMap[ generatedKey ] = currentSlot[constCommonDivID];
				}
			);

			if(slots.length > 0){				
				tempURL = (win.pm_dm_enabled != true && ! utilHasOwnProperty(lessOneHopPubList, conf[constPubId])) ? 'gads.pubmatic.com/AdServer/AdCallAggregator' : (adserver_url +  conf[constPubId] + '/GRPBID/index.html');
				request_url = protocol + tempURL + '?' + utilToUrlParams(conf);
				request_url += '&adslots=' + encodeURIComponent('[' + slots.join(',') +']');
			}
			
			return request_url;
		},

		fetchBids = function(configObject, activeSlots){
			utilLog(adapterID+constCommonMessage01);

			var adapterConfig = utilLoadGlobalConfigForAdapter(configObject, adapterID, adapterConfigMandatoryParams);
			if(!adapterConfig){
				return;
			}
						
			var isServerSideKey = adapterConfig[constConfigServerSideKey];
			if(isServerSideKey == false){
				utilLog(adapterID+': '+constConfigServerSideKey+' should be true.'+constCommonMessage07)
				return;
			}

			pubID = adapterConfig[constConfigPubID];
			wrapperImpressionID = configObject.global.pwt.wiid;

			if(pubID == 0){
				utilLog(adapterID+': '+constConfigPubID+' should be non-zero.'+constCommonMessage07);
				return;
			}

			initConf();
			conf['kval_param'] = JSON.stringify(configObject[constConfigGlobalKeyValue]);

			if(utilHasOwnProperty(ortbEnabledPublishers, pubID)){
				makeOrtbCall(activeSlots, adapterConfig[constConfigKeyGeneratigPattern]);
			}else{
				utilLoadScript(createLegacyCall(activeSlots, adapterConfig[constConfigKeyGeneratigPattern]));
			}

			initiateUserSyncup();
		},

		generateCreative = function(creative, tracker, pubID){
			var isTrackerFirstEnabled = function(pubId){
					var config = {37576: ''}; // this is a whitelist
					return utilHasOwnProperty(config, pubId);
				},				
				tracker = '<iframe frameborder="0" allowtransparency="true" marginheight="0" marginwidth="0" scrolling="no" width="0" hspace="0" vspace="0" height="0"'
				+ ' style="height:0p;width:0p;display:none;" src="' + decodeURIComponent(tracker) + '"></iframe>',
				output = (isTrackerFirstEnabled(pubID) ? tracker : '') + decodeURIComponent(creative) + (!isTrackerFirstEnabled(pubID) ? '' : tracker)
			;

			if(win.PubMaticAI!=null){
				output = "<span class='PubAdAI'>" + output + "</span>";
			}

			return output;
		}
	;

	win.PWT.PubmaticAdapterCallback = function(){
		var localProgKeyValueMap = win.progKeyValueMap,
			bidDetailsMap = win.bidDetailsMap
		;

		win.progKeyValueMap = {};
		for( var key in localProgKeyValueMap){

			if( utilHasOwnProperty(localProgKeyValueMap, key) ){

				var progKeyValueMapDetails = localProgKeyValueMap[key].split(';');
				var progKeyValueMapDetailsLength = progKeyValueMapDetails.length;
				if(progKeyValueMapDetailsLength == 8){
					
					var bidObject = bidManagerCreateBidObject(
						parseFloat(progKeyValueMapDetails[3]), 
						progKeyValueMapDetails[7], 
						"", 
						generateCreative(bidDetailsMap[ progKeyValueMapDetails[5] ][constPubMaticResponseCreative], bidDetailsMap[ progKeyValueMapDetails[5] ][constPubMaticResponseTrackingURL], pubID), 
						"",
						bidDetailsMap[ progKeyValueMapDetails[5] ][constCommonWidth],
						bidDetailsMap[ progKeyValueMapDetails[5] ][constCommonHeight],						
						key
					);
					bidManagerSetBidFromBidder(pmSlotToDivIDMap[key], adapterID, bidObject);
				}
			}
		}
	};
	
	return {
		fB: fetchBids,
		dC: utilDisplayCreative,
		ID: function(){
			return adapterID;
		}
	};
	
})());