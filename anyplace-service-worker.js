/*
    s01042

    ServiceWorkers are totaly event driven
    so we have to hook into the corresponding events
    
    inspect ServiceWorkers with 
    chrome://inspect/#service-workers
    chrome://serviceworker-internals/
*/

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

self.addEventListener ('ready', (registration) => {
    if (registration.periodicSync) {
        console.log ('periodic sync is supported')
    } else {
        console.log ('periodic sync is not suppoerted')
    }
})

self.addEventListener ('sync', (event) => {
    if (event.tag === 'ANYPLACE_BACKGROUND_SYNC') {
        event.waitUntil (doBackgroundSync())
    }
})

function doBackgroundSync () {
    console.log ('background sync triggered')
    
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