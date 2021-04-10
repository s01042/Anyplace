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

    theMap = null
    theMapMarker = null

    constructor () {
        super ()
        this.myAppConfig = new AppConfig (false)
        this.myServiceComponent = new ServiceComponent (this.myAppConfig)
    }

    /**
     * this is the main entry point of my application class
     * connectedCallback is a lifecycle method of web components
     * and will be called when the component is inserted into the DOM of the hosting page
     */
    connectedCallback () {
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
            })
            .catch (e => {
                console.log (`oops, something went wrong: '${e.message}'`)
            })
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
            let coords = dataItem[1].Location.coords
            document.querySelector ('leaflet-map-controller').updateMap (coords.latitude, coords.longitude)
        })
        this.observer.observe (target, config)
    }


    getDataItem (itemID) {
        /**
         * breaking from forEach with return is not possible?!
         * that's why i'm using a classic for-loop
         */
        for (let index = 0; index < this.arrayOfEntries.length; index ++) {
            if (this.arrayOfEntries[index][0] === itemID) {
                return this.arrayOfEntries[index]
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