import ServiceComponent from './ServiceComponent.js'
import AppConfig from './AppConfig.js'

/**
 * this is a web component without any gui elements
 * it is some kind of a controller that glues together 
 * other components with the gui
 */
class Application extends HTMLElement {

    myServiceComponent = null
    myAppConfig = null
    arrayOfEntries = null
    observer = null
    resizeObserver = null

    theMap = null
    theMapMarker = null

    deferredInstallationPrompt = null

    constructor () {
        super ()
        this.myAppConfig = new AppConfig (false)
        this.myServiceComponent = new ServiceComponent (this.myAppConfig)
        this.registerServiceWorker ()
        this.wireupTheDrawer ()
        this.wireupAboutDialog ()
        this.wireupReloadButton ()
    }

    /**
     * register serviceWorker
     * the serviceWorker location is important because it defines its scope
     * Whats listed in start_url of the manifest must always be servable by the service worker, even when offline.
     * another important point: a ServiceWorker location has to be https hosted
     * location 'localhost' will work as well
     */
    async registerServiceWorker () {
        if ('serviceWorker' in navigator) {
            try {
                /**
                 * the max scope of a serviceWorker is the location of the worker!
                 * personal github pages are all hosted under one root domain (`https://[username].github.io/`).  
                 * this may cause some stumbling when registering serviceWorkers
                 * IMPORTANT: check that serviceWorker scope is matching with the scope in the manifest
                 */
                let reg = await navigator.serviceWorker.register ('./anyplace-service-worker.js', {scope: './'})
                //TODO  i want to force a sw update in dev env. 
                //      comment this in in production env.
                //await reg.update ()
                await this.registerBackgroundSync ()
                // notify (`ServiceWorker registered. Scope is '${reg.scope}'!`, 'info', 'info-circle', 5000)
            } catch (exception) {
                let alert = this.createAlert (`ServiceWorker registration failed: ${exception}`, 'warning', 'exclamation-triangle', 10000)
                alert.toast ()
            }
        } else {
            let alert = this.createAlert (`your browser does not support ServiceWorker.`)
            alert.toast ()
        }
    }

    /**
     * https://web.dev/periodic-background-sync/
     * https://developer.chrome.com/docs/devtools/javascript/background-services/?utm_source=devtools
     * register the app for periodic background syncing
     * TODO:    refactor this and put it into the service worker itself
     */
    async registerBackgroundSync () {
        let syncPermission = null
        //safari does not support this query in 2022!
        if (navigator.permissions && navigator.permissions.query) {
            syncPermission = await navigator.permissions.query ({name: 'periodic-background-sync'})
        }
        if ((syncPermission) && (syncPermission.state === 'granted')) {
            //  check if ready is supported
            if (navigator.serviceWorker.ready) {
                navigator.serviceWorker.ready.then ( async registry => {

                    if ('PeriodicSyncManager' in window) {
                        //  check if already installed
                        const tags = await registry.periodicSync.getTags ()
                        if (tags.includes ('ANYPLACE_BACKGROUND_SYNC')) {
                            // we are done here 
                            console.log ("periodic sync 'ANYPLACE_BACKGROUND_SYNC' already installed")
                        } else {
                            try {
                                await registry.periodicSync.register('ANYPLACE_BACKGROUND_SYNC', {
                                    minInterval: 24 * 60 * 60 * 1000    // one in 24 hrs.
                                });
                            } catch (error) {
                                console.log (`Bakground sync not available ${error.message}`)
                            }      
                        }
                    }
                })
            }
        } else {
            //let alert = this.createAlert ('Background sync is disabled.', 'warning', 'exclamation-triangle', 3000)
            //alert.toast ()
            console.log ('background sync is not available')
        }
    }

    /**
     * TODO:    this button should only be shown if NOT in browser mode.
     *          in browser mode there is the standard way to reload the page.
     *          on apple devices in standalone mode there is no swipe down gesture
     *          to reload the page, so the button can be helpful.  
     */
    wireupReloadButton () {
        const reloadButton = document.getElementById ('reloadPage')
        reloadButton.addEventListener ('click', e => {
            reloadButton.blur ()
            location.reload ()
        })
    }

    /**
     * wires up the shoelace drawer component 
     */
    wireupTheDrawer () {
        const drawer = document.getElementById('drawer');
        const openButton = document.getElementById ('openDrawer');
        const closeButton = drawer.querySelector('sl-button[type="info"]');

        openButton.addEventListener('click', () => drawer.show());
        closeButton.addEventListener('click', () => drawer.hide());
    }

    /**
     * wire up the about dialog
     */
    wireupAboutDialog () {
        const showAboutButton = document.getElementById ('showAbout')
        showAboutButton.addEventListener ('click', () =>{
            let aboutDialog = this.createAboutDialog ()
            //  if dialog is closed by escape key or by clicking in the overlay
            //  remove from it from the dom. this event will also be triggered
            //  if aboutDialog.hide () is called
            aboutDialog.addEventListener ('sl-after-hide', () => {
                document.body.removeChild (aboutDialog)
            })
            let okayButton = aboutDialog.querySelector ("sl-button[type='primary']")
            okayButton.addEventListener ('click', () => {
                aboutDialog.hide ()
                //  this will trigger the sl-after-hide event
            })
            aboutDialog.show ()    
        })
    }

    /**
     * this is the main entry point of my application class
     * connectedCallback is a lifecycle method of web components
     * and will be called when the component is inserted into the DOM of the hosting page
     */
    connectedCallback () {

        this.installResizeObserver ()
        let fetchMessage = this.createAlert ("trying to fetch data ...", "info", "info-circle", 10000)
        fetchMessage.toast ()
        this.myServiceComponent.fetchDataFromGoogleDrive ()
            .then (remoteData => {
                this.arrayOfEntries = remoteData
                let first = true 
                let reversed = remoteData.reverse ()
                reversed.forEach(element => {
                    /**
                     * there is a two dimensional array returned 
                     * i'm only interrested in the second element of the array 
                     * because this is are the data objects
                     */
                    first ? this.createTimelineItem (element[1], true) : this.createTimelineItem (element[1])
                    first = false                    
                })
                /**
                 * now is the perfect time to instantiate a 
                 * MutantObserver to listen for changes on DOM elements i'm interested in
                 */
                this.installOberver ()
                /**
                 * the timeline.js file is bound to the document.ready event
                 * so i deferred the loading until the dynamic content is inserted into the DOM
                 */
                this.loadTimelineLibrary ()
                    .then ( () => {
                        this.selectMostRecentEntryAsDefault ()
                    })
                fetchMessage.hide ()
            })
            .catch (e => {
                //fetchMessage.hide ()
                let errorMessage = this.createAlert ("oops ... something went wrong! Probably CORS server not responding.", "danger", "info-circle", 10000)
                errorMessage.toast ()
                //console.log (`oops, something went wrong: '${e.message}'`)
            })
        this.promoteLocalInstallation ()
        //  if app is started remove the badge
        if (navigator.clearAppBadge) {
            navigator.clearAppBadge ().catch (error => {
                console.log (`clear badge failed: ${error}`)
            })
        }
        //  handle the notificationPermission state initialy
        this.handleNotificationPermission ()
        //  and install an event handler to monitor further changes of state
        if (navigator.permissions) {
            let that = this
            navigator.permissions.query ({name: 'notifications'}).then (notificationPermission => {
                notificationPermission.onchange = function () {
                    //console.log ('handle notification.onchange event')
                    that.handleNotificationPermission ()
                }
            })        
        }
    }

    /**
     *  At firt run notificationPermission will be default (prompt or ask).
     *  We than will enable the button to request notificationPermission at users will.
     *  Browsers save this decision for the particular domain and 
     *  will NOT ask for your permission again. For them to ask again 
     *  you would have to make them forget your last decision (eg reset ). 
     *  that's why it's only appropriate to enable the button when the 
     *  permission state is "prompt" or "default". 
     *  Otherwise disable the button and indicate the actual state by an icon.
     *  But the user can change the granted authorization later via browser settings
     *  or system settings on android. We can install an event handler to monitor this
     *  changes and indicate the actual permission.  
     */
    handleNotificationPermission () {
        let button = document.getElementById ('notification')
        if ((Notification) && ((Notification.permission === 'prompt') || (Notification.permission === 'default'))) {
            button.disabled = false
            button.innerHTML = `
                <sl-icon slot='suffix' name='question-diamond' style="font-size: 1.5rem"></sl-icon>
                notification
            `
            button.addEventListener ('click', e => {
                Notification.requestPermission ().then (result => {
                    button.blur ()
                }) 
            })
        } 
        else if ((Notification) && (Notification.permission === 'granted')) {
            button.disabled = true
            button.innerHTML = `
                <sl-icon slot='suffix' name='bell-fill' style="font-size: 1.5rem"></sl-icon>
                enabled
            `
        }
        else if ((Notification) && (Notification.permission === 'denied')) {
            button.disabled = true
            button.innerHTML = `
                <sl-icon slot='suffix' name='bell' style="font-size: 1.5rem"></sl-icon>
                disabled
            `
        }
        else {
            button.disabled = true
        }
    }

    /**
     * this method handles the user defined app installation promotion
     * this again is not supported on iOS/Safari devices. there you need to 
     * use the "share button" | "add to home-screen" action
     */
    promoteLocalInstallation () {

        let installButton = null
        /**
         * first install an event handler to "catch" the beforinstallprompt
         * this event will only be fired, if the app is not already installed
         */
        window.addEventListener ('beforeinstallprompt', (e) => {
            //  prevent the browsers default behavior
            e.preventDefault ()
            //  and save the event to trigger it later
            this.deferredInstallationPrompt = e
            if (installButton) return
            //  insert an installButton in the gui
            installButton = Object.assign (document.createElement ('sl-button'), {
                id: 'installApp',
                size: 'large',
                pill: true,
                innerHTML: `
                    <sl-icon slot="suffix" name="download" style="font-size: 1.5rem"></sl-icon>
                    install as app`
            })
            installButton.addEventListener ('click', e => {
                if (this.deferredInstallationPrompt) {
                    this.deferredInstallationPrompt.prompt ()
                }
                installButton.blur ()   // remove the focus anyway
            })
            let buttonGroup = document.getElementsByTagName ('sl-button-group')
            buttonGroup.item (0).appendChild (installButton)
        })

        /**
         * next we need a way to detect if the pwa was succesfully installed
         * You can use the result.outcome property to determine if the user 
         * installed your app from within the user interface. 
         * But, if the user installs the PWA from the address bar or other 
         * browser component, result.outcome won't help. 
         * Instead, you should listen for the appinstalled event. 
         * It is fired whenever your PWA is installed, no matter what mechanism 
         * is used to install your PWA.
         */
        window.addEventListener ('appinstalled', () => {
            // if succesfully installed disable the installButton
            // and disgard the deferredInstallationPrompt

            let buttonGroup = document.getElementsByTagName ('sl-button-group')
            buttonGroup.item (0).removeChild (installButton)
            this.deferredInstallationPrompt = null
        })
    }

    /**
     * create a shoelace alert component, init it and return it
     * 
     * @param {*} message 
     * @param {*} type 
     * @param {*} icon 
     * @param {*} duration 
     * @returns 
     */
    createAlert (message, type = 'primary', icon = 'info-circle', duration = 3000) {
        const alert = Object.assign(document.createElement('sl-alert'), {
            type: type,
            closable: true,
            duration: duration,
            innerHTML: `
              <sl-icon name="${icon}" slot="icon"></sl-icon>
              ${this.escapeHtml(message)}
            `
        })
      
        document.body.append(alert);
        return alert
    }

    /**
     * create an instance of aboutDialog and return it
     * @returns 
     */
    createAboutDialog () {
        const dialog = Object.assign (document.createElement ('sl-dialog'), {
            label: 'Über diese App',
            innerHTML: `
                <sl-button slot="footer" type="primary">Okay</sl-button>
                <sl-avatar
                    image="https://s01042.github.io/Anyplace/images/anyplace.png"
                    alt="anyplace logo"
                ></sl-avatar>
                <strong>&nbspAnyplace</strong><br><br>
                Folge mir mit dieser App auf meiner Radreise durch Europa.<br><br>
                Ich werde in regeläßigen Abständen meine Orts-, Wetter- und Zustandsdaten aktualisieren. So kannst du wissen, wo ich bin und wie es mir geht. &#128692;
                <br><br><br>
                <small><center>by s01042</center></small>
            `
        })
        //dialog.style = "--width: 50vw;"
        document.body.append (dialog)
        return dialog
    }

    /**
     * Always escape HTML for text arguments!
     * 
     * @param {*} html 
     * @returns 
     */
    escapeHtml(html) {
        const div = document.createElement('div');
        div.textContent = html;
        return div.innerHTML;
      }  

    /**
     * let's select the last timeline entry as the default one because 
     * it is the most recent one
     * 
     * this is a quick hack in regard of how timeline.js works:
     * by looking at the implementation one can see that two things are
     * necessary to select the last item of the timeline and to enforce 
     * the complete update of the user interface
     * 1.   simulate a click event on the link element of the penultimate child element in the eventList
     * 2.   dispatch a "next" keyboardEvent to enforce the selection of the last child element in the eventList
     * 3.   timeline.js will handle this keyboardEvent and will now also update the timeLinePosition so that
     *      the selected element will scroll to visibility
     */
    selectMostRecentEntryAsDefault () {
        let eventList = document.querySelector ('.events').firstElementChild.children
        let lastEntry = eventList.item (eventList.length -2)
        let a = lastEntry.firstElementChild
        a.click ()
        let keyEvent = new KeyboardEvent ('keyup', {'keyCode': 39, 'which': 39})
        document.dispatchEvent (keyEvent) // fire a next keyEvent which will be handled by the timeline
    }

    /**
     * disconnect the observer when the web component will be disconnected
     */
    disconnectedCallback() {
        if (this.observer) {
            this.observer.disconnect ()
        }
        if (this.resizeObserver) {
            this.resizeObserver.disconnect ()
        }
    }

    /**
     * I need to detect the flex wrap event to apply a marginTop on the
     * map view and align it properly. But there is no way to detect this 
     * wrapping in CSS. Installing a ResizeObserver and observe the parents widths
     * will do the job.
     */
    installResizeObserver () {
        let target = document.querySelector ('.parent')
        this.resizeObserver = new ResizeObserver (entries => {
            for (let entry of entries) {
                if (entry.contentRect.width > 1420) {
                    document.getElementById ('map-container').style.marginTop = "250px"
                } else {
                    document.getElementById ('map-container').style.marginTop = "5px"
                }
            }
        })
        this.resizeObserver.observe (target)
    }

    /**
     * here i install a MutationOberver to let me inform when timeline.js 
     * will have selected a new timeline event item. 
     * timeline.js will then set the class attribute to '.selected ' on the newly selected timeline event item 
     * so i will observe for this attribute change and will get the itemID attribute from the newly selected element 
     */
    installOberver () {
        /**
         * i am interested in attribute changes in the DOM element <div class="events-content">
         * so this div is the target of the observer
         * the timeline.js will change the class attribute multiple times and will 
         * finally set the attribute class to value 'selected' on the current selected entry
         */
        let target = document.querySelector ('.events-content')
        let config = {attributes: true}
        this.observer = new MutationObserver ( mutations => {
            /**
             * there will be multiple MutationRecords in mutations because 
             * multiple updates on the attribute class will happen (eg. when animation slide in/out ... 
             * examine in element browser in dev tools)
             * i only need one MutationRecord and will take the last one
             */
            let mutation = mutations[mutations.length - 1]
            /**
             * if the MutationOberver event handler is called then there was 
             * an attribute change in .events-content (refed by mutation.target)
             * i'm interested in the first (and only) child element, the <ul class='no-bullet'>
             */
            let eventContentList = mutation.target.firstElementChild
            /**
             * and here i will query for the element with class name .selected
             * because this is the newly selected element
             */
            let selectedElement = eventContentList.querySelector ('.selected')
            let dataItem = this.getDataItem (selectedElement.attributes['itemID'].value)
            /* here i could calculate the distance between the current position and the last one */
            //let prevDataItem = this.getPrevDataItem (selectedElement.attributes['itemID'].value)

            let coords = dataItem[1].Location.coords
            document.querySelector ('leaflet-map-controller').updateMap (coords.latitude, coords.longitude)
        })
        this.observer.observe (target, config)
    }

    /**
     * get the dataItem by ID
     * 
     * @param {*} itemID 
     * @returns 
     */
    getDataItem (itemID) {
        /**
         * breaking from forEach with return is not possible
         * i use a classic for loop instead
         */
        for (let index = 0; index < this.arrayOfEntries.length; index ++) {
            if (this.arrayOfEntries[index][0] === itemID) {
                return this.arrayOfEntries[index]
            }
        }
    }

    /**
     * get the previous dataItem if one exist
     * @param {*} itemID 
     * @returns 
     */
    getPrevDataItem (itemID) {
        for (let index = 0; index < this.arrayOfEntries.length; index ++) {
            if (this.arrayOfEntries[index][0] === itemID) {
                if (index > 0) {
                    return this.arrayOfEntries[index - 1]
                } else {
                    return null
                }
            }
        }
    }

    /**
     * i'm using the timeline from https://codepen.io/ritz078/pen/LGRWjE
     * i like it! kudos to the developer.
     * the timeline is responsive and has key bindings for navigation
     * if time is left i will reimplement it as a web component
     */
    loadTimelineLibrary () {
        return new Promise ( (resolve, reject) => {
            let head = document.head
            let script = document.createElement('script')
            script.type = 'text/javascript'
            script.src = './timeline/timeline.js'
            // onload will be called when the loading of the js file is completed
            // then the timeline will be locally available for further use so 
            // we bind to resolve the promise to this event
            // we don't resolve the promise by ourself, but onload will do it
            script.onload = resolve 
            script.onerror = function (reason) {
                reject (reason)
            }
            // Fire the loading
            head.appendChild (script);     
        })
    }

    /**
     * 
     * @param {*} fromDataEntry 
     * @param {*} selected 
     */
    createTimelineItem (fromDataEntry, selected = false) {
        /**
         * get a ref to the eventList and eventContentList to append child nodes
         */
        let eventlist = document.querySelector ('.events').firstElementChild
        let eventContentList = document.querySelector ('.events-content').firstElementChild
        /**
         * prepare the date strings for the new timeline events
         */
        let timelineItemDate = this.formatDateString (fromDataEntry.Location.timestamp)
        let hrefDate = this.formatDateForHrefText (timelineItemDate)
        /**
         * now add the new timeline event by manipualting the dom
         */
        let newEventItem = document.createElement ('li')
        let a = document.createElement ('a')
        a.setAttribute ('href', '#0')
        a.setAttribute ('itemID', fromDataEntry.ID)
        a.setAttribute ('data-date', timelineItemDate)
        if (selected) {
            a.setAttribute ('class', 'selected')
        }

        a.innerText = hrefDate
        newEventItem.appendChild (a)
        eventlist.appendChild (newEventItem)
        /**
         * and add the corresponding events-content element
         */
        let newEventContentElement = document.createElement ('li')
        newEventContentElement.setAttribute ('data-date', timelineItemDate)
        newEventContentElement.setAttribute ('itemID', fromDataEntry.ID)
        if (selected) {
            newEventContentElement.setAttribute ('class', 'selected')
        }
        let h2 = document.createElement ('h2')
        h2.innerText = fromDataEntry.City ? fromDataEntry.City.title + ` (ca. ${Math.round(fromDataEntry.City.distance / 1000)} km)`: 'no city data available'
        newEventContentElement.appendChild (h2)
        let em = document.createElement ('em')
        //em.innerHTML = `${timelineItemDate} &nbsp; ${this.getTimeStringFromTimestamp (fromDataEntry.Location.timestamp)}` 
        em.innerHTML = fromDataEntry.WeatherData ? `
                            ${this.getTimeStringFromTimestamp (fromDataEntry.Location.timestamp)} &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; 
                            <img 
                                src="https://www.metaweather.com/static/img/weather/${fromDataEntry.WeatherData.weather_state_abbr}.svg" 
                                alt="${fromDataEntry.WeatherData.weather_state_name}" 
                                width="32" 
                                height="32"
                                title=${fromDataEntry.WeatherData.weather_state_name}
                            >
                            &nbsp; ${Math.round (fromDataEntry.WeatherData.the_temp)} &#8451;
                        ` : `
                            ${this.getTimeStringFromTimestamp (fromDataEntry.Location.timestamp)} &nbsp; 
                        `
        newEventContentElement.appendChild (em)
        let p = document.createElement ('p')
        p.innerText = fromDataEntry.SMS === undefined ? 'no short message text available' : fromDataEntry.SMS
        newEventContentElement.appendChild (p)
        eventContentList.appendChild (newEventContentElement)
    }

    getTimeStringFromTimestamp (theTimestampValue) {
        let lang = navigator.language
        let timeString = new Date (theTimestampValue).toLocaleTimeString (lang, {hour: '2-digit', minute: '2-digit'})
        return timeString
    }

    /**
     * get the date in form of 'dd.mm.yyyy' (eg. 01.05.2020)
     * as needed by the 'data-date' of timeline events
     * @param {*} fromInputValue 
     */
    formatDateString (fromInputValue) {
        return new Date (fromInputValue).
                    toLocaleDateString("de-DE",  
                        {
                            month: '2-digit',
                            day: '2-digit',
                            year: 'numeric'
                        }
                    )
        
    }

    /**
     * even shorten the date to 'dd mmm' (eg. 01 Mai)
     * as needed by the href text of a timeline event
     * @param {*} fromTimelineItemDate 
     */
    formatDateForHrefText (fromTimelineItemDate) {
        let parts = fromTimelineItemDate.split ('.')
        let month = ""
        switch (parts[1]) {
            case '01': 
                month = 'Jan'
                break
            case '02': 
                month = 'Feb'
                break
            case '03': 
                month = 'Mär'
                break
            case '04': 
                month = 'Apr'
                break
            case '05': 
                month = 'Mai'
                break
            case '06': 
                month = 'Jun'
                break
            case '07': 
                month = 'Jul'
                break
            case '08': 
                month = 'Aug'
                break
            case '09': 
                month = 'Sep'
                break
            case '10': 
                month = 'Okt'
                break
            case '11': 
                month = 'Nov'
                break
            case '12': 
                month = 'Dez'
                break    
        }
        return parts[0] + ' ' + month
    }
}

/**
 * define the custom element
 */
window.customElements.define('application-class', Application)

export default Application