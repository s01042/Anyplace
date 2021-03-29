/**
 * i will encapsulate the necessary leaflet map functionality in a
 * web component to clean up my source code a bit 
 */
const template = document.createElement ('template')
/**
 * I need the leaflet.css locally in the shadow DOM 
 * so i will "link" it here 
 */
template.innerHTML = `
    <style>
        .map-root {
            min-height: 500px;
            width: 100%;
            max-width: 768px;
            margin: 2em auto;
            border: 1px solid black
          }
          
    </style>
    <link rel="stylesheet" 
        href="./leaflet/leaflet.css"
        integrity="sha512-xodZBNTC5n17Xt2atTPuE1HxjVMSvLVW9ocqUKLsCC5CXdbqCmblAshOMAS6/keqq/sMZMZ19scR4PsZChSR7A=="
        crossorigin=""
    />
    <div id='myMap' class='map-root'></div>
`

export default class LeafletMapController extends HTMLElement {

    constructor () {
        super ()
        this.map = null
        this.mapMarker = null
        this.DEFAULT_LAT = '52.4137053'
        this.DEFAULT_LONG = '13.091715'

        this.attachShadow ({mode: 'open'})
        this.shadowRoot.appendChild (template.content.cloneNode (true))
    }

    /**
     * this is a component lifecycle method which is called 
     * when the component is connected to the dom of the hosting page
     * now it's time to load the required leaflet.js library 
     */
    connectedCallback() {
        this.loadLeafletScript ()
            .then ( () => {
                let lat = this.getAttribute ('latitude')
                let long = this.getAttribute ('longitude')
                this.initializeMap (lat, long)
            })
    }

    /**
     * initialize and setup the map
     * my default location will be at home 
     */
    initializeMap (latitude, longitude) {
        let mapHTMLElement = this.shadowRoot.querySelector ('#myMap')
        if (latitude && longitude) {
            this.map = L.map (mapHTMLElement).setView ([latitude, longitude], 13)
        } else {
            this.map = L.map (mapHTMLElement).setView ([this.DEFAULT_LAT, this.DEFAULT_LONG], 13)
        }
        L.tileLayer('https://api.mapbox.com/styles/v1/{id}/tiles/{z}/{x}/{y}?access_token=pk.eyJ1IjoibWFwYm94IiwiYSI6ImNpejY4NXVycTA2emYycXBndHRqcmZ3N3gifQ.rJcFIG214AriISLbB6B5aw', {
            maxZoom: 18,
            attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
                '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
            id: 'mapbox/streets-v11',
            tileSize: 512,
            zoomOffset: -1
        }).addTo(this.map);
    }

    // /**
    //  * update the map and the marker with the newly selected lat/long
    //  */
    updateMap (latitude, longitude) {
        this.map.panTo ([latitude, longitude])
        if (! this.mapMarker) {
            let myIcon = L.icon ({
                iconUrl: './leaflet/images/marker-icon-2x.png',
                shadowUrl: './leaflet/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [10, 41], // point of the icon which will correspond to marker's location
                shadowSize: [25, 41],
                shadowAnchor: [4, 41]
            })
            this.mapMarker = L.marker([latitude, longitude], {icon: myIcon}).addTo(this.map)
        } else {
            this.mapMarker.setLatLng ([latitude, longitude])
        }   
    }

    /**
     * this is a static method of HTMLElement
     * here you can define the attributes for which you will 
     * observe changes of their values
     */
    static get observedAttributes() {
        return ['latitude', 'longitude']
    }

    /**
     * this is a method of HTMLElement which will be called
     * every time an observed attribute will change
     * @param {*} name 
     * @param {*} oldValue 
     * @param {*} newValue 
     */
    attributeChangedCallback(name, oldValue, newValue) {
        // TODO: call updateMap
        switch (name) {
            case 'latitude':
                //console.log (`new attribute value: ${newValue}`)
                break;
            case 'longitude':
                //console.log (`new attribute value: ${newValue}`)
                break;
        }
    }

    /**
     * dynamic loading of leaflet.js
     */
    loadLeafletScript () {
        return new Promise ( (resolve, reject) => {
            let head = document.head
            const script = document.createElement ('script')
            script.type = 'text/javascript'
            script.src = "./leaflet/leaflet.js"
            script.integrity="sha512-XQoYMqMTK8LvdxXYG3nZ448hOEQiglfqkJs1NOQV44cWnUrBc8PkAOcXy20w0vlaXaVUearIOBhiXZ5V3ynxwA=="
            script.crossOrigin = ""
            script.onload = resolve
            script.onerror = function (reason) {
                reject (reason)
            }
            // fire the loading
            head.appendChild (script)
        })
    }
}

window.customElements.define ('leaflet-map-controller', LeafletMapController)