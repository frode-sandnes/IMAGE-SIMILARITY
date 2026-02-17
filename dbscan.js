/**
 * Distance calculation utilities
 */
const Distance = {
    euclidean: (v1, v2) => {
        const sum = v1.reduce((acc, val, i) => {
            const d = val - (v2[i] || 0);
            return acc + d * d;
        }, 0);
        return Math.sqrt(sum);
    }
};

/**
 * Represents a single data point in the algorithm
 */
class Point {
    constructor(value, index) {
        this.value = Array.isArray(value) ? value : [value];
        this.index = index;
        this.clusterId = null;
        this.visited = false;
    }
}

class DBScan {
    /**
     * @param {Array} data - Input dataset
     * @param {number} eps - Maximum distance between two samples (epsilon)
     * @param {number} minPoints - The number of samples in a neighborhood for a point to be a core point
     */
    constructor(data, eps, minPoints) {
        this.isMultiDimensional = Array.isArray(data[0]);
        this.points = data.map((v, i) => new Point(v, i));
        this.eps = eps;
        this.minPoints = minPoints;
    }

    /**
     * Finds all points in the dataset within distance 'eps'
     */
    regionQuery(point) {
        return this.points.filter(target => {
            // We include the point itself in the query
            return Distance.euclidean(point.value, target.value) <= this.eps;
        });
    }

    /**
     * Expands a cluster starting from a core point
     */
    expandCluster(point, neighbors, cluster) {
        point.clusterId = cluster.id;
        cluster.data.push(this.isMultiDimensional ? point.value : point.value[0]);

        // Process every neighbor. Note: the neighbors array grows dynamically
        for (let i = 0; i < neighbors.length; i++) {
            const neighbor = neighbors[i];

            if (!neighbor.visited) {
                neighbor.visited = true;
                const secondaryNeighbors = this.regionQuery(neighbor);

                if (secondaryNeighbors.length >= this.minPoints) {
                    // If neighbor is a core point, add its neighbors to our search list
                    neighbors.push(...secondaryNeighbors.filter(sn => !neighbors.includes(sn)));
                }
            }

            // If neighbor doesn't belong to any cluster yet, add it to this one
            if (neighbor.clusterId === null) {
                neighbor.clusterId = cluster.id;
                cluster.data.push(this.isMultiDimensional ? neighbor.value : neighbor.value[0]);
            }
        }
    }

    /**
     * Executes the DBSCAN algorithm
     */
    run() {
        const clusters = [];
        const noise = [];

        for (const point of this.points) {
            if (point.visited) continue;

            point.visited = true;
            const neighbors = this.regionQuery(point);

            if (neighbors.length < this.minPoints) {
                noise.push(this.isMultiDimensional ? point.value : point.value[0]);
            } else {
                const newCluster = {
                    id: clusters.length,
                    data: []
                };
                clusters.push(newCluster);
                this.expandCluster(point, neighbors, newCluster);
            }
        }

        return { clusters, noise };
    }
}

// Simple export wrapper
const sdbscan = (data, eps, min) => new DBScan(data, eps, min).run();
