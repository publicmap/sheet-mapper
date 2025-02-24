export const config = {
    mapboxgl: {
        accessToken: 'pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiY2x2MzZwbGRyMGdheDJtbXVwdDA4aDNyaCJ9.nbvz6aNGQo68xa4NtWH26A',
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
                        "url": "mapbox://styles/mapbox/standard",
                        "config": {
                            "lightPreset": "dusk",
                        }
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