export const config = {
    mapboxgl: {
        accessToken: 'pk.eyJ1IjoiZGhhbWFyYXIiLCJhIjoiY2wzbndleGM0MGhlejNjcGV5Z2V0a2E5dyJ9.MgJI6ePjYJ6ihnHL_nOYaA',
        map: {
            container: 'map',
            hash: true,
            style: {
                "version": 8,
                "sources": {
                },
                "layers": [],
                "imports": [
                    {
                        "id": "basemap",
                        "url": "mapbox://styles/dhamarar/clocbtfsj016901pfgucqgix6"
                    }
                ]
              }
        },
        geolocate: {
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true
        }
    }
}; 