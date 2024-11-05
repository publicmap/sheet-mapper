export const config = {
    mapboxgl: {
        accessToken: 'pk.eyJ1IjoicGxhbmVtYWQiLCJhIjoiY2x2MzZwbGRyMGdheDJtbXVwdDA4aDNyaCJ9.nbvz6aNGQo68xa4NtWH26A',
        map: {
            container: 'map',
            style: 'mapbox://styles/planemad/clzsr0s3c00f701pihaefhc37',
            center: [73.8567, 18.5204],
            zoom: 5,
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