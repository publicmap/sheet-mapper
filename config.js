export const config = {
    mapboxgl: {
        accessToken: 'pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiY2x2MzZwbGRyMGdheDJtbXVwdDA4aDNyaCJ9.nbvz6aNGQo68xa4NtWH26A',
        map: {
            container: 'map',
            hash: true
        },
        geolocate: {
            positionOptions: {
                enableHighAccuracy: true
            },
            trackUserLocation: true
        }
    }
}; 