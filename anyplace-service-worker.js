/*
    s01042

    ServiceWorkers are totaly event driven
    so we have to hook into the corresponding events
    
    inspect ServiceWorkers with 
    chrome://inspect/#service-workers
    chrome://serviceworker-internals/
*/
const DOCUMENT_END_POINT = 'https://infinite-castle-19858.herokuapp.com/api/getGoogleDoc?docID=1hvpoA2NNjfe8PELZNxWR7mJnNMQ4Sn49'
const cacheName = 'Anyplace-V1'

/**
 * static assets should be as compact as possible
 * 
 */
 const staticAssets = [
    /*  my own assets  */
    './index.html',
    './styles.css',
    './anyplace-service-worker.js',
    './components/AppConfig.js',
    './components/Application.js',
    './components/LeafletMapController.js',
    './components/ServiceComponent.js',
    /* the timeline assets */
    './timeline/timeline.js',
    './timeline/img/cd-arrow.svg',
    /* the leaflet assets */
    './leaflet/images/layers-2x.png',
    './leaflet/images/layers.png',
    './leaflet/images/marker-icon-2x.png',
    './leaflet/images/marker-icon.png',
    './leaflet/images/marker-shadow.png',
    //'./leaflet/leaflet-src.esm.js',
    //'./leaflet/leaflet-src.esm.js.map',
    //'./leaflet/leaflet-src.js',
    //'./leaflet/leaflet-src.js.map',
    './leaflet/leaflet.css',
    './leaflet/leaflet.js',
    //'./leaflet/leaflet.js.map',
    /* the essential external resources */
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.37/dist/themes/base.css',
    'https://cdn.jsdelivr.net/npm/@shoelace-style/shoelace@2.0.0-beta.37/dist/shoelace.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jquery/2.1.3/jquery.min.js'
 ]

 /**
 * first the serviceWorker will be installed and the install event will occur
 * we bind to this event, open the client side cache and store all the
 * static content of the app to be ready for offline usage
 */
self.addEventListener ('install', async (e) => {
    const cache = await caches.open (cacheName)
    await cache.addAll (staticAssets)

    /**
     * For a page with no previous service worker files, 
     * the newly installed service worker becomes activated immediately.
     * If the page already has an activated service worker and a new file is pushed, 
     * the new file will still be parsed and installed. Once installed, 
     * it will wait for an opportunity to become activated.
     * by skipWait we are telling the newly installed service worker to skip the waiting state 
     * and move directly to activating.
     */
    return self.skipWaiting ()
})

self.addEventListener ('activate', e => e.waitUntil (self.clients.claim ()))

self.addEventListener ('ready', (registration) => {
    if (registration.periodicSync) {
        console.log ('periodic sync is supported')
    } else {
        console.log ('periodic sync is not supported')
    }
})

/**
 * this eventhandler will listen to the PeriodicSyncManager events
 * 
 */
self.addEventListener ('periodicsync', (event) => {
    if (event.tag === 'ANYPLACE_BACKGROUND_SYNC') {
        event.waitUntil (doBackgroundSync())
    }
})

/**
 * TODO:    fetch new data
 *          get data from local cache
 *          compare data
 *          act appropriately
 */
async function doBackgroundSync () {
    let liveData = null
    let cachedData = null
    //  open cache
    const cache = await caches.open (cacheName)
    //  get cached data first
    const cachedReponse = await cache.match (DOCUMENT_END_POINT)
    if (cachedReponse.ok) {
        const cachedJson = await cachedReponse.json ()
        cachedData = cachedJson.value
    }
    //  get the live data
    const liveResponse = await fetch (DOCUMENT_END_POINT, {credentials: 'same-origin'})
    //  and update the cache with the new liveData
    await cache.put (DOCUMENT_END_POINT, liveResponse.clone())  

    if (liveResponse.ok) {
        const liveJson = await liveResponse.json ()
        liveData = liveJson.value
    }
    //  now check if notification is required
    if (liveData && cachedData) {
        if (liveData.length === cachedData.length) {
            console.log (`there are new data`)
            showNotification ()
        }
    }
}

function showNotification () {
    const msg = {
        body: 'Es gibt neue Nachrichten vom Radler',
        icon: './images/anyplace.png',
        tag: 'notification',
        actions: [{action: 'show', title: 'Anzeigen'}, {action: 'dismiss', title: 'Später'}]
    }
    if (Notification.permission === 'granted') {
        self.registration.showNotification ('Anyplace', msg)
    }
}

self.onnotificationclick = function (event) {
    event.notification.close ()

    //  check if app window is already open
    event.waitUntil (clients.matchAll ({type: 'window'})
        .then (function (clientList) {
            if (clientList.length === 0) {
                //TODO  openWindow requires permission to show popups
                //      ask for permission if necessary
                if (clients.openWindow && event.action === 'show') {
                    clients.openWindow ('./').then (windowClient => {
                        return windowClient.focus ()
                    })
                }
            } else {
                for (let i = 0; i < clientList.length; i++) {
                    let client = clientList [i]
                    if ('focus' in client) return client.focus ()
                }
            }
        })
    )
}

/**
 * When a serviceWorker is initially registered, 
 * pages won't use it until they next load. 
 * The claim() method causes those pages to be controlled immediately.
 */
self.addEventListener('activate', (e) =>{
    self.clients.claim()
})

/**
 * here we are implementing a hook so that our serviceWorker 
 * can intercept every request
 * there are various caching strategies for different scenarios
 * see https://web.dev/offline-cookbook/#stale-while-revalidate for more informations
 * 
 */
 self.addEventListener('fetch', (event) =>{
    /**
     * evaluate the request url and use pattern matching
     * every call to api.mapbox.com will be a network only call
     * without caching, because i want live map data or no data
     */
    const requestUrl = new URL (event.request.url)
    /**
     * this pattern will even match calls via the proxy server
     */
    if (/\/api.mapbox.com/.test (requestUrl)) {
        event.respondWith (networkOnly (event.request))
    } else {
        event.respondWith (staleWhileRevalidate (event.request))
    }
})



/**
 * for the map api calls i will establish a network only strategy
 * i'm not interested in caching this responses
 * @param {*} request 
 */
 async function networkOnly (request) {
    return fetch (request, {
        credentials: 'same-origin'
    })
}

/**
 * i use stale-while-revalidate for all content other than the leaflet map tiles: 
 * 
 * @param {*} request 
 */
 async function staleWhileRevalidate (request) {
    // open the cache
    const cache = await caches.open (cacheName)
    /**
     * try to fetch from cache
     * this should work for all the static content of the app 
     * */ 
    const cachedVersion = await cache.match (request)

    // if online fetch an update if possible and cache the new version
    if (navigator.onLine) {
        try {
            const freshVersion = await fetch (request, {credentials: 'same-origin'})
            /**
             * the response of fetch is a stream and because we want the 
             * browser to consume the response as well as the cache 
             * consuming the response, we need to clone it so we have two
             * streams
             */
            await cache.put (request, freshVersion.clone())         
            if (freshVersion) {
                return freshVersion
            } else {
                return cachedVersion
            } 
        } catch (e) {
            return cachedVersion
        }    
    } else {
        return cachedVersion
    }
}